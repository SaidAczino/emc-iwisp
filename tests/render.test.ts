import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { construirResultadoEstadoCuenta } from '../src/domain/estadoCuenta.js';
import { SinMovimientosError } from '../src/domain/errors.js';
import type { Movimiento } from '../src/domain/types.js';
import { PdfRenderer, exigirMovimientos, nombreArchivoEstadoCuenta } from '../src/pdf/render.js';
import { renderEstadoCuentaHtml } from '../src/pdf/template.js';
import { clienteFake } from './fakes.js';

function mov(i: number): Movimiento {
  return {
    tipo: i % 3 === 0 ? 'cobranza' : 'factura',
    numero: String(1000 + i),
    referencia: i % 3 === 0 ? 'Referencia ' + i : '',
    detalle: `Movimiento numero ${i}`,
    importe: 300 + i,
    fecha: new Date(2025, i % 12, (i % 27) + 1, 10, i % 60, 0),
    balancePortal: 900,
    idMovimiento: String(1000 + i),
  };
}

describe('nombre de archivo (task 7.8)', () => {
  it('identifica al cliente y evita colisiones entre clientes distintos', () => {
    const a = nombreArchivoEstadoCuenta({ id: '453', nombre: 'Marnay Sarmiento' }, new Date(2026, 9, 7));
    const b = nombreArchivoEstadoCuenta({ id: '7', nombre: 'Michel Callejas' }, new Date(2026, 9, 7));

    expect(a).toBe('estado-cuenta_453_marnay-sarmiento_20261007.pdf');
    expect(b).toBe('estado-cuenta_7_michel-callejas_20261007.pdf');
    expect(a).not.toBe(b);
  });

  it('normaliza acentos y caracteres raros', () => {
    expect(nombreArchivoEstadoCuenta({ id: '9', nombre: 'José Pérez (norte)' })).toContain('jose-perez-norte');
  });
});

describe('guardas de generación (task 7.9)', () => {
  it('sin movimientos no se genera documento', () => {
    expect(() =>
      exigirMovimientos({ ...construirResultadoEstadoCuenta(clienteFake(), [mov(1)]), movimientos: [] }),
    ).toThrow(SinMovimientosError);
  });
});

describe('render del PDF (tasks 7.5 y 7.10)', () => {
  it('un cliente con más de 100 movimientos pagina sin perder filas', async () => {
    const movimientos = Array.from({ length: 130 }, (_, i) => mov(i + 1));
    const resultado = construirResultadoEstadoCuenta(clienteFake({ saldoReportado: 0 }), movimientos);
    const html = renderEstadoCuentaHtml(resultado);

    // Ningún movimiento se pierde en el HTML.
    for (let i = 1; i <= 130; i++) expect(html).toContain(`Movimiento numero ${i}`);
    expect(resultado.movimientos).toHaveLength(130);

    const renderer = new PdfRenderer();
    try {
      const pdf = await renderer.render(html);
      expect(pdf.byteLength).toBeGreaterThan(1000);

      const documento = await PDFDocument.load(pdf);
      // Más de una página => la paginación repartió el histórico.
      expect(documento.getPageCount()).toBeGreaterThanOrEqual(2);
    } finally {
      await renderer.close();
    }
  }, 120_000);
});
