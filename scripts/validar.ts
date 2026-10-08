/**
 * Validación end-to-end (tasks 9.1–9.3) contra el portal real de I-WISP.
 *
 * Por cada cliente seleccionado:
 *   1. Descuenta las filas del HTML del portal de forma independiente
 *      (`title="Cobranza|Factura"`); si el portal no expone esa página para el
 *      cliente, se marca como n/d.
 *   2. Genera el estado de cuenta con la misma orquestación de producción.
 *   3. Guarda el PDF en `output/` y reporta totales, ambos saldos y páginas.
 *
 * Además escanea los primeros deudores para encontrar el historial más extenso
 * (task 9.3) y lo incluye en el lote validado.
 *
 * Uso:  npm run validar             (5 deudores + el historial más extenso)
 *       npm run validar -- 453 7    (sólo esos clientes)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import type { Workbook } from 'exceljs';
import { loadConfig } from '../src/config.js';
import { Redactor, createLogger } from '../src/log.js';
import { IwispApiClient } from '../src/portal/apiClient.js';
import { HttpPortalSession } from '../src/portal/session.js';
import { HtmlMovementSource } from '../src/sources/htmlSource.js';
import { XlsxMovementSource } from '../src/sources/xlsxSource.js';
import { CompositeMovementSource } from '../src/sources/composite.js';
import { PdfRenderer } from '../src/pdf/render.js';
import { GeneradorEstadoCuenta } from '../src/service/generar.js';

const pesos = (n: number): string => `$${n.toFixed(2)}`;

async function main(): Promise<void> {
  const config = loadConfig();
  const redactor = new Redactor();
  redactor.register(config.apiKey, config.password, config.username);
  const logger = createLogger({ redactor, level: config.logLevel });

  const session = new HttpPortalSession({ config, logger });
  const api = new IwispApiClient({ config, logger });
  const htmlSource = new HtmlMovementSource(session, logger);
  const xlsxSource = new XlsxMovementSource(session, logger);
  const movementSource = new CompositeMovementSource(xlsxSource, htmlSource, logger);
  const renderer = new PdfRenderer();
  const generador = new GeneradorEstadoCuenta({ session, clientSource: api, movementSource, renderer, logger });

  const outputDir = resolve(process.cwd(), config.outputDir);
  mkdirSync(outputDir, { recursive: true });

  await session.ensure();

  const args = process.argv.slice(2).filter((a) => a !== '--sin-scan');
  const conScan = !process.argv.includes('--sin-scan');
  const deudores = await api.fetchClientesConAdeudo();
  console.log(`Deudores reportados por /api/getClientDebt: ${deudores.length}`);

  let ids: string[];
  let historialLargo: { id: string; conteo: number } | null = null;

  if (args.length > 0) {
    ids = args;
  } else {
    // Clientes >=450: el portal SÍ expone su página HTML, lo que permite
    // cruzar el recuento XLSX contra el HTML de forma independiente.
    ids = deudores
      .filter((d) => Number(d.id) >= 450)
      .slice(0, 5)
      .map((d) => d.id);

    if (conScan) {
      // Task 9.3 — historial más extenso entre TODOS los deudores.
      for (const d of deudores) {
        try {
          const { bytes } = await session.fetchFile(`/clientes/movimientos-xlsx/${encodeURIComponent(d.id)}`);
          const conteo = await contarFilasMovimiento(bytes);
          if (!historialLargo || conteo > historialLargo.conteo) historialLargo = { id: d.id, conteo };
        } catch {
          // Un cliente sin exportación no invalida el escaneo.
        }
      }
      if (historialLargo && !ids.includes(historialLargo.id)) ids.push(historialLargo.id);
    }
  }

  console.log(`Clientes a validar: ${ids.join(', ')}\n`);

  const filas: string[] = [
    '| ID | Cliente | Movs (fuente) | Filas portal HTML | Total facturado | Total cobrado | Saldo histórico | Saldo I-WISP | Coincide | Páginas | PDF |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---|---:|---|',
  ];
  const fallos: string[] = [];

  for (const id of ids) {
    try {
      const documento = await generador.generar(id);
      const { resultado, pdf, filename } = documento;

      // Recuento independiente desde el HTML del portal (patrón de comparación).
      // Cualquier `title` de fila cuenta (incluye "Nota de Débito"/"Nota de Crédito").
      let filasPortal = 'n/d';
      try {
        const html = await session.fetchPage(`/clientes/facturas_cobranza/${id}`);
        filasPortal = String((html.match(/<tr[^>]*title="/g) ?? []).length);
      } catch {
        filasPortal = 'n/d (el portal no expone la página HTML)';
      }

      writeFileSync(resolve(outputDir, filename), pdf);
      const paginas = (await PDFDocument.load(pdf)).getPageCount();

      const { totales, verificacion, cliente } = resultado;
      const coincideMovs = filasPortal.startsWith('n/d')
        ? 'n/d'
        : filasPortal === String(resultado.movimientos.length)
          ? 'sí'
          : `NO (${resultado.movimientos.length} vs ${filasPortal})`;

      console.log(
        `cliente ${id} (${cliente.nombre})\n` +
          `  movimientos: ${resultado.movimientos.length} | filas portal HTML: ${filasPortal} | coinciden: ${coincideMovs}\n` +
          `  facturado ${pesos(totales.totalFacturado)} | cobrado ${pesos(totales.totalCobrado)} | saldo histórico ${pesos(totales.saldoPendiente)} | saldo I-WISP ${pesos(verificacion.reportado)} | ${verificacion.coincide ? 'coinciden' : 'DISCREPAN'}\n` +
          `  páginas: ${paginas} | ${filename} (${pdf.byteLength} bytes)\n`,
      );

      filas.push(
        `| ${id} | ${cliente.nombre} | ${resultado.movimientos.length} | ${filasPortal} | ${pesos(totales.totalFacturado)} | ${pesos(totales.totalCobrado)} | ${pesos(totales.saldoPendiente)} | ${pesos(verificacion.reportado)} | ${String(verificacion.coincide)} | ${paginas} | \`${filename}\` |`,
      );
    } catch (err) {
      const causa = err instanceof Error ? err.message : String(err);
      console.error(`cliente ${id}: FALLÓ — ${causa}\n`);
      fallos.push(`${id}: ${causa}`);
      filas.push(`| ${id} | — | — | — | — | — | — | — | FALLÓ | — | ${causa.replace(/\|/g, '/')} |`);
    }
  }

  const informe = [
    '# Validación end-to-end — estado de cuenta',
    '',
    `Fecha: ${new Date().toISOString()}`,
    '',
    ...filas,
    '',
    historialLargo
      ? `Historial extenso revisado (task 9.3): cliente ${historialLargo.id} con ${historialLargo.conteo} movimientos en el XLSX del portal.`
      : 'No se escaneó historial extenso (se pasaron clientes por argumento).',
    '',
    fallos.length > 0 ? `Clientes que fallaron: ${fallos.join('; ')}` : 'Todos los clientes seleccionados generaron su PDF.',
    '',
    'Criterio: `Filas portal HTML` cuenta las filas con `title` de la tabla de cuenta corriente del portal',
    '(`Factura`, `Cobranza`, `Nota de Débito`, `Nota de Crédito`); cuando el portal no expone esa página',
    '(clientes con id < 450 responden `302 /clientes/listado`) se marca n/d y el recuento queda en el XLSX,',
    'que es la exportación oficial del portal. `Saldo histórico` = facturas − cobranzas sobre el histórico',
    'completo (incluye DX como cargo y CX como abono, ver design.md D9); `Saldo I-WISP` = `getClient.balance`.',
    '',
  ].join('\n');
  writeFileSync(resolve(outputDir, 'informe-validacion.md'), informe, 'utf8');

  await renderer.close();
  console.log(`Informe escrito en ${config.outputDir}/informe-validacion.md`);
  if (fallos.length > 0) process.exitCode = 1;
}

async function contarFilasMovimiento(bytes: Uint8Array): Promise<number> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const load = wb.xlsx.load.bind(wb.xlsx) as (d: unknown) => Promise<Workbook>;
  await load(Buffer.from(bytes));
  const sheet = wb.worksheets[0];
  if (!sheet) return 0;
  let encabezado = 0;
  sheet.eachRow({ includeEmpty: false }, (row, n) => {
    const vals = (Array.isArray(row.values) ? (row.values as unknown[]) : []).map((v) =>
      v == null ? '' : String(v),
    );
    const norm = vals.map((v) => v.toLowerCase());
    if (norm.includes('tipo') && norm.includes('importe')) encabezado = n;
  });
  if (encabezado === 0) return 0;
  let filas = 0;
  for (let r = encabezado + 1; r <= sheet.rowCount; r++) {
    const vals = sheet.getRow(r).values as unknown[];
    const texto = vals.map((v) => (v == null ? '' : String(v)).trim()).filter((v) => v !== '');
    if (texto.length > 0) filas++;
  }
  return filas;
}

main().catch((err: unknown) => {
  console.error('Validación fallida:', err);
  process.exit(1);
});
