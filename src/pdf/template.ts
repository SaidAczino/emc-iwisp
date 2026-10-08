/**
 * Plantilla HTML/CSS del estado de cuenta (tasks 7.1–7.7 / D1 / D5 / D6).
 * El HTML se convierte a PDF con la hoja de estilos de paginación: `thead`
 * repetido en cada página y filas sin cortar (task 7.5).
 */
import { formatoMoneda } from '../domain/totals.js';
import type { Movimiento, ResultadoEstadoCuenta, ServicioCliente } from '../domain/types.js';

export function esc(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NO_DISPONIBLE = 'no disponible';

/** Fecha `dd/mm/aaaa hh:mm:ss` (mismo criterio que el portal). */
export function formatoFecha(fecha: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(fecha.getDate())}/${p(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}`;
}

function o(valor: string | null | undefined): string {
  const v = (valor ?? '').trim();
  return v === '' ? NO_DISPONIBLE : esc(v);
}

function filaServicio(s: ServicioCliente): string {
  const plan = s.plan ? `${s.nombre || '—'} (plan ${esc(s.plan)})` : esc(s.nombre || NO_DISPONIBLE);
  return `<tr><td>${esc(s.tipo || '—')}</td><td>${plan}</td><td class="num">${formatoMoneda(s.costo)}</td></tr>`;
}

function filaMovimiento(m: Movimiento): string {
  const tipoLabel = m.tipo === 'factura' ? 'Factura' : 'Cobranza';
  return [
    `<tr class="${m.tipo}">`,
    `<td class="tipo"><span class="badge ${m.tipo}">${tipoLabel}</span></td>`,
    `<td class="num">${esc(m.numero)}</td>`,
    `<td>${esc(m.referencia) || NO_DISPONIBLE}</td>`,
    `<td>${esc(m.detalle) || NO_DISPONIBLE}</td>`,
    `<td class="num importe">${formatoMoneda(m.importe)}</td>`,
    `<td class="num fecha">${formatoFecha(m.fecha)}</td>`,
    `</tr>`,
  ].join('');
}

function bloqueSaldos(resultado: ResultadoEstadoCuenta): string {
  const { verificacion, totales } = resultado;
  const clase = verificacion.coincide ? 'ok' : 'alerta';
  const nota = verificacion.coincide
    ? 'Coinciden: la extracción del histórico se ve completa.'
    : `Discrepancia de ${formatoMoneda(Math.abs(verificacion.calculado - verificacion.reportado))}: ` +
      'los datos extraídos podrían estar incompletos. Verifique antes de entregar el documento.';
  return `
    <section class="saldos">
      <div class="saldo">
        <span class="etiqueta">Saldo histórico calculado</span>
        <span class="valor ${clase}">${formatoMoneda(totales.saldoPendiente)}</span>
      </div>
      <div class="saldo">
        <span class="etiqueta">Saldo según I-WISP</span>
        <span class="valor">${formatoMoneda(verificacion.reportado)}</span>
      </div>
      <p class="nota ${clase}">${nota}</p>
    </section>`;
}

const CSS = `
  @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1f2933; margin: 0; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #0b6e4f; padding-bottom: 8px; margin-bottom: 14px; }
  .brand { font-size: 22pt; font-weight: bold; color: #0b6e4f; letter-spacing: 1px; }
  .brand small { display: block; font-size: 8pt; font-weight: normal; color: #52606d; letter-spacing: 0; }
  .titulo { text-align: right; }
  .titulo h1 { font-size: 15pt; margin: 0; color: #102a43; }
  .cortesia { display: inline-block; margin-top: 6px; padding: 3px 8px; border: 1px solid #b7791f;
    background: #fffbea; color: #8a6d1a; font-size: 8pt; font-weight: bold; text-transform: uppercase; }
  .emision { font-size: 8.5pt; color: #52606d; margin-bottom: 10px; }
  h2 { font-size: 11pt; color: #0b6e4f; margin: 14px 0 6px; border-bottom: 1px solid #d9e2ec; padding-bottom: 3px; }
  .datos { width: 100%; border-collapse: collapse; }
  .datos td { padding: 3px 6px; vertical-align: top; border-bottom: 1px dotted #e4e7eb; }
  .datos .etiqueta { width: 130px; color: #52606d; font-weight: bold; }
  .servicios { width: 100%; border-collapse: collapse; }
  .servicios th, .servicios td { border: 1px solid #d9e2ec; padding: 4px 6px; text-align: left; }
  .servicios th { background: #f0f4f8; font-size: 9pt; }
  .movimientos { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .movimientos thead { display: table-header-group; }
  .movimientos th { background: #102a43; color: #ffffff; font-size: 8.5pt; padding: 5px 6px; text-align: left;
    border: 1px solid #102a43; }
  .movimientos td { border: 1px solid #d9e2ec; padding: 4px 6px; font-size: 9pt; }
  .movimientos tr { break-inside: avoid; page-break-inside: avoid; }
  .movimientos tbody tr.factura { background: #fff5f5; }
  .movimientos tbody tr.cobranza { background: #f0fff4; }
  .movimientos .num { text-align: right; white-space: nowrap; }
  .movimientos .fecha { white-space: nowrap; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 8pt; font-weight: bold; }
  .badge.factura { background: #fed7d7; color: #9b2c2c; }
  .badge.cobranza { background: #c6f6d5; color: #22543d; }
  .resumen { width: 55%; border-collapse: collapse; margin-left: auto; margin-top: 12px; }
  .resumen td { padding: 5px 8px; border-bottom: 1px solid #d9e2ec; font-size: 10pt; }
  .resumen .num { text-align: right; font-variant-numeric: tabular-nums; }
  .resumen .total td { font-weight: bold; background: #f0f4f8; border-top: 2px solid #102a43; }
  .saldos { margin-top: 16px; padding: 10px; border: 1px solid #d9e2ec; background: #f8fafc;
    display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; break-inside: avoid; }
  .saldo { display: flex; flex-direction: column; }
  .saldo .etiqueta { font-size: 8.5pt; color: #52606d; text-transform: uppercase; }
  .saldo .valor { font-size: 13pt; font-weight: bold; color: #102a43; }
  .nota { flex-basis: 100%; margin: 6px 0 0; font-size: 9pt; }
  .nota.ok { color: #22543d; }
  .nota.alerta { color: #9b2c2c; font-weight: bold; }
  .valor.alerta { color: #9b2c2c; }
  .pie { margin-top: 14px; font-size: 8pt; color: #7b8794; border-top: 1px solid #d9e2ec; padding-top: 6px; }
`;

export function renderEstadoCuentaHtml(resultado: ResultadoEstadoCuenta, opciones: { emitidoEn?: Date } = {}): string {
  const { cliente, movimientos, totales } = resultado;
  const emitido = opciones.emitidoEn ?? new Date();
  const filas = movimientos.map(filaMovimiento).join('\n');
  const servicios =
    cliente.servicios.length > 0
      ? cliente.servicios.map(filaServicio).join('\n')
      : `<tr><td colspan="3">${NO_DISPONIBLE}</td></tr>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Estado de cuenta ${esc(cliente.id)} - ${esc(cliente.nombre)}</title>
<style>${CSS}</style>
</head>
<body>
  <header class="doc-header">
    <div class="brand">EMC<small>Administración y redes</small></div>
    <div class="titulo">
      <h1>Estado de Cuenta</h1>
      <div class="cortesia">Documento de cortesía &mdash; sin validez fiscal</div>
    </div>
  </header>

  <div class="emision">Emitido el ${formatoFecha(emitido)} &middot; Cliente ${esc(cliente.id)}</div>

  <h2>Datos del cliente</h2>
  <table class="datos">
    <tr><td class="etiqueta">Nombre</td><td>${o(cliente.nombre)}</td></tr>
    <tr><td class="etiqueta">Domicilio</td><td>${o(cliente.direccion)}</td></tr>
    <tr><td class="etiqueta">Localidad</td><td>${o(cliente.localidad)}</td></tr>
    <tr><td class="etiqueta">RFC</td><td>${o(cliente.rfc)}</td></tr>
    <tr><td class="etiqueta">Celular</td><td>${o(cliente.celular)}</td></tr>
    <tr><td class="etiqueta">Tipo de servicio</td><td>${o(cliente.tipoServicio)}</td></tr>
  </table>

  <h2>Servicios asociados</h2>
  <table class="servicios">
    <thead><tr><th>Tipo</th><th>Plan / servicio</th><th>Costo</th></tr></thead>
    <tbody>${servicios}</tbody>
  </table>

  <h2>Movimientos (${movimientos.length})</h2>
  <table class="movimientos">
    <thead>
      <tr>
        <th>Tipo</th>
        <th style="text-align:right">Número</th>
        <th>Referencia</th>
        <th>Detalle</th>
        <th style="text-align:right">Importe</th>
        <th style="text-align:right">Fecha</th>
      </tr>
    </thead>
    <tbody>
${filas}
    </tbody>
  </table>

  <table class="resumen">
    <tr><td>Total facturado</td><td class="num">${formatoMoneda(totales.totalFacturado)}</td></tr>
    <tr><td>Total cobrado</td><td class="num">${formatoMoneda(totales.totalCobrado)}</td></tr>
    <tr class="total"><td>Saldo pendiente (histórico calculado)</td><td class="num">${formatoMoneda(totales.saldoPendiente)}</td></tr>
  </table>

  ${bloqueSaldos(resultado)}

  <p class="pie">Documento de cortesía generado por EMC a partir de los registros de I-WISP. No constituye comprobante
  fiscal. Los movimientos se muestran en orden cronológico.</p>
</body>
</html>`;
}
