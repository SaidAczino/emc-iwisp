import { describe, expect, it } from 'vitest';
import { construirResultadoEstadoCuenta } from '../src/domain/estadoCuenta.js';
import type { Movimiento } from '../src/domain/types.js';
import { esc, formatoFecha, renderEstadoCuentaHtml } from '../src/pdf/template.js';
import { clienteFake } from './fakes.js';

function mov(overrides: Partial<Movimiento> = {}): Movimiento {
  return {
    tipo: 'factura',
    numero: '13355',
    referencia: '',
    detalle: 'Factura Mensual Octubre',
    importe: 300,
    fecha: new Date(2026, 9, 1, 7, 49, 55),
    balancePortal: 900,
    idMovimiento: '13355',
    ...overrides,
  };
}

const CON_SALDO = construirResultadoEstadoCuenta(clienteFake({ saldoReportado: 600 }), [
  mov({ tipo: 'factura', importe: 900, fecha: new Date(2026, 9, 1, 7, 49, 55) }),
  mov({ tipo: 'cobranza', numero: '9720', referencia: 'Bnacomer => Caja', detalle: 'MES DE OCTUBRE', importe: 300, fecha: new Date(2026, 9, 3, 12, 59, 40) }),
]);

describe('plantilla del documento (tasks 7.1–7.7 / D5 / D6)', () => {
  const html = renderEstadoCuentaHtml(CON_SALDO, { emitidoEn: new Date(2026, 9, 7, 15, 30, 0) });

  it('marca visible de cortesía sin validez fiscal, sin UUID ni sello (task 7.1 / D6)', () => {
    expect(html).toMatch(/cortes[ií]a/i);
    expect(html).toMatch(/sin validez fiscal/i);
    expect(html).not.toMatch(/uuid/i);
    expect(html).not.toMatch(/sello del SAT/i);
  });

  it('bloque de datos del cliente con nombre, domicilio, localidad, RFC y servicios (task 7.2)', () => {
    expect(html).toContain('Marnay Sarmiento');
    expect(html).toContain('Hulum 22');
    expect(html).toContain('Paseos del Lago 2');
    expect(html).toContain('WI-Plan300_10M_Zumpango');
    expect(html).toContain('$300.00'); // costo del servicio
    expect(html).toContain('RFC');
  });

  it('campos ausentes como "no disponible" sin romper la generación (task 7.3)', () => {
    const sinRfc = renderEstadoCuentaHtml(
      construirResultadoEstadoCuenta(clienteFake({ rfc: null, direccion: null }), [mov()]),
    );
    const filasRfc = sinRfc.match(/<td class="etiqueta">RFC<\/td><td>[^<]+<\/td>/g) ?? [];
    expect(filasRfc.join(' ')).toContain('no disponible');
    expect(sinRfc).toContain('no disponible');
    expect(sinRfc).not.toContain('<td class="etiqueta">RFC</td><td></td>');
  });

  it('tabla con tipo, número, referencia, detalle, importe y fecha + distinción visual (task 7.4)', () => {
    expect(html).toContain('<th>Tipo</th>');
    expect(html).toContain('<th style="text-align:right">Número</th>');
    expect(html).toContain('<th>Referencia</th>');
    expect(html).toContain('<th>Detalle</th>');
    expect(html).toContain('<th style="text-align:right">Importe</th>');
    expect(html).toContain('<th style="text-align:right">Fecha</th>');
    expect(html).toContain('class="badge factura"');
    expect(html).toContain('class="badge cobranza"');
    expect(html).toContain('tr class="factura"');
    expect(html).toContain('tr class="cobranza"');
  });

  it('paginación: thead repetible y filas sin cortar (task 7.5)', () => {
    expect(html).toMatch(/\.movimientos thead \{ display: table-header-group; \}/);
    expect(html).toMatch(/break-inside: avoid/);
    expect(html).toContain('@page');
  });

  it('pie con total facturado, total cobrado y saldo pendiente (task 7.6)', () => {
    expect(html).toContain('Total facturado');
    expect(html).toContain('Total cobrado');
    expect(html).toContain('Saldo pendiente');
    expect(html).toContain('$900.00');
    expect(html).toContain('$300.00');
    expect(html).toContain('$600.00');
  });

  it('doble saldo etiquetado con nota de coincidencia (task 7.7 / D5)', () => {
    expect(html).toContain('Saldo histórico calculado');
    expect(html).toContain('Saldo según I-WISP');
    expect(html).toMatch(/Coinciden/);
  });

  it('saldo discrepante: nota explícita con ambos valores, sin ocultar ni promediar (task 7.7)', () => {
    const discrepante = renderEstadoCuentaHtml(
      construirResultadoEstadoCuenta(clienteFake({ saldoReportado: 1000 }), [mov({ importe: 300 })]),
    );
    expect(discrepante).toContain('Saldo histórico calculado');
    expect(discrepante).toContain('Saldo según I-WISP');
    expect(discrepante).toMatch(/[Dd]iscrepancia/);
    expect(discrepante).toContain('$300.00');
    expect(discrepante).toContain('$1,000.00');
  });

  it('el detalle se muestra literal, sin interpretar el periodo (task 5.8 / D7)', () => {
    const literal = renderEstadoCuentaHtml(
      construirResultadoEstadoCuenta(clienteFake({ saldoReportado: 0 }), [
        mov({ detalle: 'MES DE MAYO', fecha: new Date(2026, 6, 15) }),
      ]),
    );
    expect(literal).toContain('MES DE MAYO');
    expect(literal).toContain('15/07/2026');
  });

  it('escapa HTML en los datos del portal (seguridad)', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    const conInyeccion = renderEstadoCuentaHtml(
      construirResultadoEstadoCuenta(
        clienteFake({ nombre: '<img src=x onerror=1>' }),
        [mov({ detalle: '<b>bold</b>' })],
      ),
    );
    expect(conInyeccion).not.toContain('<img src=x');
    expect(conInyeccion).not.toContain('<b>bold</b>');
    expect(conInyeccion).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('formato de fecha dd/mm/aaaa hh:mm:ss', () => {
    expect(formatoFecha(new Date(2026, 9, 3, 12, 59, 40))).toBe('03/10/2026 12:59:40');
  });
});
