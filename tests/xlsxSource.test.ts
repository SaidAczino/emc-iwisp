import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { ExtraccionError } from '../src/domain/errors.js';
import { CompositeMovementSource } from '../src/sources/composite.js';
import { XlsxMovementSource } from '../src/sources/xlsxSource.js';
import { FakePortalSession } from './fakes.js';

const PATH = '/clientes/movimientos-xlsx/453';

type Celda = string | null;

async function xlsxBytes(filas: Celda[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Movimientos');
  for (const fila of filas) ws.addRow(fila);
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

const ENCABEZADO_PORTAL = [
  ['I-WISP Manager'],
  ['Movimientos de cuenta'],
  ['07-10-2026 21:22:07'],
  ['Cliente: (453) Sarmiento Marnay'],
  ['Tipo', 'Número', 'Cobranza', 'Detalle', 'Importe', 'Fecha', 'Balance'],
];

async function sesionConXlsx(filas: Celda[][]): Promise<FakePortalSession> {
  const bytes = await xlsxBytes([...ENCABEZADO_PORTAL, ...filas]);
  return new FakePortalSession({}, { [PATH]: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes } });
}

describe('XlsxMovementSource (task 5.4)', () => {
  it('lee el XLSX del portal: encabezado, Tipo CO/FX y columnas correctas', async () => {
    const session = await sesionConXlsx([
      ['CO', '9720', 'Bnacomer Nicolas => Caja Ciber', 'MES DE OCTUBRE HSBC420677', '$ 300.00', '03/10/2026 12:59:40', '$ 600.00'],
      ['FX', '13355', '-', 'Factura Mensual Octubre', '$ 300.00', '01/10/2026 07:49:55', '$ 900.00'],
    ]);
    const rows = await new XlsxMovementSource(session).fetchMovimientos('453');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tipo: 'CO',
      numero: '9720',
      cobranza: 'Bnacomer Nicolas => Caja Ciber',
      detalle: 'MES DE OCTUBRE HSBC420677',
      importe: '$ 300.00',
      fecha: '03/10/2026 12:59:40',
      balance: '$ 600.00',
    });
    expect(rows[1]?.tipo).toBe('FX');
  });

  // Regresión: el XLSX real del portal pone los datos en la columna 3
  // (columnas 1–2 son huecos del array de ExcelJS, que `findIndex` recorre).
  it('lee el XLSX cuando los datos arrancan en la columna 3 (portal real)', async () => {
    const bytes = await xlsxBytes([
      [null, null, 'I-WISP Manager'],
      [null, null, 'Movimientos de cuenta'],
      [null, null, '07-10-2026 22:06:33'],
      [null, null, 'Cliente: (453) Sarmiento Marnay'],
      [null, null, 'Tipo', 'Número', 'Cobranza', 'Detalle', 'Importe', 'Fecha', 'Balance'],
      [null, null, 'CO', '9720', 'Bnacomer Nicolas => Caja Ciber', 'MES DE OCTUBRE HSBC420677', '$ 300.00', '03/10/2026 12:59:40', '$ 600.00'],
      [null, null, 'FX', '13355', '-', 'Factura Mensual Octubre', '$ 300.00', '01/10/2026 07:49:55', '$ 900.00'],
    ]);
    const session = new FakePortalSession({}, { [PATH]: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes } });

    const rows = await new XlsxMovementSource(session).fetchMovimientos('453');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tipo: 'CO',
      numero: '9720',
      cobranza: 'Bnacomer Nicolas => Caja Ciber',
      detalle: 'MES DE OCTUBRE HSBC420677',
      importe: '$ 300.00',
      fecha: '03/10/2026 12:59:40',
      balance: '$ 600.00',
    });
    expect(rows[1]).toMatchObject({ tipo: 'FX', numero: '13355', importe: '$ 300.00' });
  });

  it('sin filas de movimiento => error explícito (task 5.11)', async () => {
    const session = await sesionConXlsx([]);
    await expect(new XlsxMovementSource(session).fetchMovimientos('453')).rejects.toBeInstanceOf(ExtraccionError);
  });

  it('respuesta que no es XLSX => error explícito', async () => {
    const session = new FakePortalSession({}, { [PATH]: { contentType: 'text/html', bytes: new TextEncoder().encode('<html>login</html>') } });
    await expect(new XlsxMovementSource(session).fetchMovimientos('453')).rejects.toThrowError(/no es un archivo válido/);
  });
});

describe('degradación XLSX -> HTML (task 5.4 / D2)', () => {
  const html = `<html><table id="tabla_cta_cte_reducida">
    <tr title="Factura"><td>a</td><td>1</td><td>-</td><td>respaldo</td><td>$ 10.00</td><td>01/01/2026 00:00:00</td><td>$ 0.00</td></tr>
  </table></html>`;

  it('usa el XLSX primario cuando responde', async () => {
    const primary = await sesionConXlsx([['FX', '1', '-', 'xlsx', '$ 10.00', '01/01/2026 00:00:00', '$ 0.00']]);
    const fallback = new FakePortalSession({ [PATH.replace('movimientos-xlsx', 'facturas_cobranza')]: html });
    const rows = await new CompositeMovementSource(new XlsxMovementSource(primary), new (await import('../src/sources/htmlSource.js')).HtmlMovementSource(fallback)).fetchMovimientos('453');
    expect(rows[0]?.detalle).toBe('xlsx');
  });

  it('cae al HTML cuando el XLSX falla', async () => {
    const primary = new FakePortalSession({}); // fetchFile lanza
    const { HtmlMovementSource } = await import('../src/sources/htmlSource.js');
    const fallback = new FakePortalSession({ [PATH.replace('movimientos-xlsx', 'facturas_cobranza')]: html });
    const rows = await new CompositeMovementSource(
      new XlsxMovementSource(primary),
      new HtmlMovementSource(fallback),
    ).fetchMovimientos('453');
    expect(rows[0]?.detalle).toBe('respaldo');
  });

  it('si ambas fallan, el error es explícito', async () => {
    const { HtmlMovementSource } = await import('../src/sources/htmlSource.js');
    const vacio = new FakePortalSession({ [PATH.replace('movimientos-xlsx', 'facturas_cobranza')]: '<table id="tabla_cta_cte_reducida"></table>' });
    await expect(
      new CompositeMovementSource(new XlsxMovementSource(new FakePortalSession({})), new HtmlMovementSource(vacio)).fetchMovimientos('453'),
    ).rejects.toBeInstanceOf(ExtraccionError);
  });
});
