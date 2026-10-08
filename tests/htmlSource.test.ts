import { describe, expect, it } from 'vitest';
import { ExtraccionError } from '../src/domain/errors.js';
import { COLUMNAS_ESPERADAS, HtmlMovementSource } from '../src/sources/htmlSource.js';
import { FakePortalSession } from './fakes.js';

const PATH = '/clientes/facturas_cobranza/453';

function filaPortal(attrs: string, celdas: string[]): string {
  const tds = celdas.map((c) => `<td align="center">${c}</td>`).join('\n');
  return `<tr ${attrs}>${tds}</tr>`;
}

function tabla(filas: string[]): string {
  return `<html><body>
    <table width="100%" border="0" cellspacing="0" id="tabla_cta_cte_reducida">
      <tr style="background-color: #cccccc;"><th>Tipo</th><th>Número</th><th>Cobranza</th><th>Detalle</th><th>Importe</th><th>Fecha</th><th>Balance</th></tr>
      ${filas.join('\n')}
    </table>
  </body></html>`;
}

const COBRANZA = [
  'CO',
  '9720',
  'Bnacomer Nicolas =&gt; Caja Ciber',
  'MES DE OCTUBRE HSBC420677',
  '$ 300.00',
  '03/10/2026 12:59:40',
  '$ 600.00',
];

const FACTURA = ['FX', '13355', '-', 'Factura Mensual Octubre', '$ 300.00', '01/10/2026 07:49:55', '$ 900.00'];

describe('HtmlMovementSource (tasks 5.1, 5.2, 5.10)', () => {
  it('extrae filas con title="Cobranza|Factura" y mapea las 7 celdas', async () => {
    const session = new FakePortalSession({
      [PATH]: tabla([
        filaPortal(`style='color:green;' title="Cobranza" class="link_listado" onclick="document.location='/cobranza/ver/9720'"`, COBRANZA),
        filaPortal(`style='color:red;'title="Factura" class="link_listado" onclick="document.location='/factura/ver/FX/13355'"`, FACTURA),
      ]),
    });
    const source = new HtmlMovementSource(session);
    const rows = await source.fetchMovimientos('453');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tipo: 'Cobranza',
      numero: '9720',
      cobranza: 'Bnacomer Nicolas => Caja Ciber',
      detalle: 'MES DE OCTUBRE HSBC420677',
      importe: '$ 300.00',
      fecha: '03/10/2026 12:59:40',
      balance: '$ 600.00',
      idMovimiento: '9720',
    });
    expect(rows[1]).toMatchObject({ tipo: 'Factura', idMovimiento: '13355' });
  });

  // El portal real usa title="Nota de Débito" para las filas DX (hallazgo 9.1).
  it('acepta title="Nota de Débito|Nota de Crédito" y normaliza a factura/cobranza', async () => {
    const session = new FakePortalSession({
      [PATH]: tabla([
        filaPortal(`style='color:red;'title="Nota de D&eacute;bito" class="link_listado" onclick="document.location='/factura/ver/FX/7'"`, [
          'DX', '7', '-', 'noviembre', '$ 300.00', '22/11/2024 19:59:04', '$ 0.00',
        ]),
        filaPortal(`style='color:green;'title="Nota de Cr&eacute;dito" class="link_listado" onclick="document.location='/cobranza/ver/69'"`, [
          'CX', '69', '-', 'por ajuste', '$ 750.00', '12/09/2025 10:24:51', '$ 0.00',
        ]),
      ]),
    });
    const rows = await new HtmlMovementSource(session).fetchMovimientos('453');
    expect(rows.map((r) => r.tipo)).toEqual(['Nota de Débito', 'Nota de Crédito']);

    const { normalizeMovimientos } = await import('../src/sources/parse.js');
    const movimientos = normalizeMovimientos(rows);
    expect(movimientos.map((m) => m.tipo)).toEqual(['factura', 'cobranza']);
    expect(movimientos.map((m) => m.importe)).toEqual([300, 750]);
  });

  it('el tipo sale del title, nunca del estilo ni de la celda (task 5.2 / D8)', async () => {
    const session = new FakePortalSession({
      [PATH]: tabla([
        filaPortal(`style='color:green;' title="Factura" class="link_listado" onclick="document.location='/factura/ver/FX/1'"`, [
          'CO',
          '1',
          '-',
          'x',
          '$ 10.00',
          '01/01/2026 00:00:00',
          '$ 0.00',
        ]),
      ]),
    });
    const rows = await new HtmlMovementSource(session).fetchMovimientos('453');
    expect(rows[0]?.tipo).toBe('Factura');
  });
});

describe('HtmlMovementSource — falla explícita (tasks 5.3, 5.11)', () => {
  it('fila sin atributo title => error de estructura', async () => {
    const session = new FakePortalSession({
      [PATH]: tabla([`<tr class="link_listado" onclick="x">${COBRANZA.map((c) => `<td>${c}</td>`).join('')}</tr>`]),
    });
    await expect(new HtmlMovementSource(session).fetchMovimientos('453')).rejects.toThrowError(/title/);
  });

  it(`fila con número distinto de ${COLUMNAS_ESPERADAS} celdas => error`, async () => {
    const session = new FakePortalSession({
      [PATH]: tabla([filaPortal('title="Factura"', FACTURA.slice(0, 6))]),
    });
    await expect(new HtmlMovementSource(session).fetchMovimientos('453')).rejects.toThrowError(/6 celdas/);
  });

  it('sin filas de movimiento => error, nunca un PDF vacío', async () => {
    const session = new FakePortalSession({ [PATH]: tabla([]) });
    await expect(new HtmlMovementSource(session).fetchMovimientos('453')).rejects.toThrowError(/vacía/);
  });

  it('tabla ausente => el markup cambió y se dice explícitamente', async () => {
    const session = new FakePortalSession({ [PATH]: '<html><body>login</body></html>' });
    await expect(new HtmlMovementSource(session).fetchMovimientos('453')).rejects.toThrowError(
      /tabla_cta_cte_reducida/,
    );
  });

  it('todo error es de tipo ExtraccionError (causa identificable)', async () => {
    const session = new FakePortalSession({ [PATH]: tabla([]) });
    await expect(new HtmlMovementSource(session).fetchMovimientos('453')).rejects.toBeInstanceOf(ExtraccionError);
  });
});
