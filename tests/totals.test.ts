import { describe, expect, it } from 'vitest';
import { construirResultadoEstadoCuenta } from '../src/domain/estadoCuenta.js';
import { SinMovimientosError } from '../src/domain/errors.js';
import {
  advertenciaDeSaldo,
  calcularTotales,
  formatoMoneda,
  ordenarCronologicamente,
  verificarSaldo,
} from '../src/domain/totals.js';
import type { Movimiento } from '../src/domain/types.js';
import { clienteFake } from './fakes.js';

function mov(overrides: Partial<Movimiento>): Movimiento {
  return {
    tipo: 'factura',
    numero: '1',
    referencia: '',
    detalle: 'x',
    importe: 300,
    fecha: new Date(2026, 0, 1, 10, 0, 0),
    balancePortal: null,
    idMovimiento: null,
    ...overrides,
  };
}

describe('cálculo de totales (tasks 6.1–6.4 / D4)', () => {
  it('suma facturas y cobranzas por separado (task 6.1/6.2)', () => {
    const t = calcularTotales([
      mov({ tipo: 'factura', importe: 300 }),
      mov({ tipo: 'factura', importe: 450 }),
      mov({ tipo: 'cobranza', importe: 500 }),
    ]);
    expect(t).toEqual({ totalFacturado: 750, totalCobrado: 500, saldoPendiente: 250 });
  });

  it('reporta cero cobrado cuando sólo hay facturas (task 6.2)', () => {
    const t = calcularTotales([mov({ tipo: 'factura', importe: 300 })]);
    expect(t.totalCobrado).toBe(0);
    expect(t.saldoPendiente).toBe(300);
  });

  it('saldo pendiente cero cuando facturado y cobrado coinciden (task 6.3)', () => {
    const t = calcularTotales([mov({ tipo: 'factura', importe: 600 }), mov({ tipo: 'cobranza', importe: 600 })]);
    expect(t.saldoPendiente).toBe(0);
  });

  it('maneja importes grandes con separadores de miles (task 6.8)', () => {
    const t = calcularTotales([
      mov({ tipo: 'factura', importe: 12345.67 }),
      mov({ tipo: 'factura', importe: 987654.32 }),
      mov({ tipo: 'cobranza', importe: 1000000 }),
    ]);
    expect(t.totalFacturado).toBe(999999.99);
    expect(t.totalCobrado).toBe(1000000);
    expect(t.saldoPendiente).toBe(-0.01);
  });

  it('la acumulación de muchos importes no arrastra error de punto flotante (task 6.8)', () => {
    const movs = Array.from({ length: 100 }, () => mov({ tipo: 'factura', importe: 0.1 }));
    expect(calcularTotales(movs).totalFacturado).toBe(10);
  });

  it('NUNCA usa el balance del portal para calcular (task 6.4)', () => {
    const t = calcularTotales([
      mov({ tipo: 'factura', importe: 300, balancePortal: 900000 }),
      mov({ tipo: 'cobranza', importe: 300, balancePortal: 900000 }),
    ]);
    expect(t.totalFacturado).toBe(300);
    expect(t.totalCobrado).toBe(300);
    expect(t.saldoPendiente).toBe(0);
  });
});

describe('verificación de congruencia (tasks 6.5–6.6 / D5)', () => {
  it('coincidencia: sin advertencia', () => {
    const v = verificarSaldo({ totalFacturado: 900, totalCobrado: 300, saldoPendiente: 600 }, 600);
    expect(v.coincide).toBe(true);
    expect(advertenciaDeSaldo(v)).toBeNull();
  });

  it('discrepancia: advertencia con ambos saldos, sin bloquear', () => {
    const v = verificarSaldo({ totalFacturado: 900, totalCobrado: 400, saldoPendiente: 500 }, 600);
    expect(v.coincide).toBe(false);
    const advertencia = advertenciaDeSaldo(v);
    expect(advertencia).toContain('$500.00');
    expect(advertencia).toContain('$600.00');
  });

  it('compara con precisión de centavos', () => {
    const v = verificarSaldo({ totalFacturado: 1000.005, totalCobrado: 0, saldoPendiente: 1000.01 }, 1000.01);
    expect(v.coincide).toBe(true);
  });

  it('formato de moneda en pesos', () => {
    expect(formatoMoneda(1234.5)).toContain('1,234.50');
  });
});

describe('orden cronológico (task 6.7)', () => {
  it('ordena ascendente por fecha con desempate estable', () => {
    const ordenados = ordenarCronologicamente([
      mov({ fecha: new Date(2026, 9, 3), numero: '9720' }),
      mov({ tipo: 'cobranza', fecha: new Date(2025, 1, 16), numero: '1290' }),
      mov({ fecha: new Date(2026, 9, 1), numero: '13355' }),
    ]);
    expect(ordenados.map((m) => m.numero)).toEqual(['1290', '13355', '9720']);
  });
});

describe('resultado completo con dobles (tasks 3.5 y 7.9)', () => {
  it('compone totales y verificación a partir de los datos maestros', () => {
    const resultado = construirResultadoEstadoCuenta(
      clienteFake({ saldoReportado: 600 }),
      [mov({ tipo: 'factura', importe: 900 }), mov({ tipo: 'cobranza', importe: 300 })],
    );
    expect(resultado.totales).toEqual({ totalFacturado: 900, totalCobrado: 300, saldoPendiente: 600 });
    expect(resultado.verificacion.coincide).toBe(true);
    expect(resultado.advertencias).toEqual([]);
    expect(resultado.cliente.id).toBe('453');
  });

  it('el desajuste se expone como advertencia sin lanzar error (task 6.6)', () => {
    const resultado = construirResultadoEstadoCuenta(
      clienteFake({ saldoReportado: 1000 }),
      [mov({ tipo: 'factura', importe: 300 })],
    );
    expect(resultado.advertencias).toHaveLength(1);
    expect(resultado.advertencias[0]).toMatch(/discrepante/i);
  });

  it('cliente sin movimientos: error identificable, no un documento (task 7.9)', () => {
    expect(() => construirResultadoEstadoCuenta(clienteFake(), [])).toThrow(SinMovimientosError);
  });
});
