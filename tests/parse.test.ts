import { describe, expect, it } from 'vitest';
import { ExtraccionError } from '../src/domain/errors.js';
import { normalizeMovimientos, normalizeTipo, parseFecha, parseImporte, parseReferencia } from '../src/sources/parse.js';
import { filaFake } from './fakes.js';

describe('tipo por valor semántico (tasks 5.2/5.5 / D8)', () => {
  it('acepta el title del HTML y el código del XLSX', () => {
    expect(normalizeTipo('Factura')).toBe('factura');
    expect(normalizeTipo('Cobranza')).toBe('cobranza');
    expect(normalizeTipo('FX')).toBe('factura');
    expect(normalizeTipo('CO')).toBe('cobranza');
    expect(normalizeTipo('  factura ')).toBe('factura');
  });

  it('rechaza cualquier otra cosa como estructura no reconocida', () => {
    expect(() => normalizeTipo('')).toThrow(ExtraccionError);
    expect(() => normalizeTipo('color:green')).toThrow(ExtraccionError);
  });

  // Tipos reales encontrados en la validación end-to-end (tasks 9.1/9.2):
  // DX = Nota de Débito (cargo) y CX = Nota de Crédito (abono).
  it('clasifica notas de débito/crédito como las encontró el portal', () => {
    expect(normalizeTipo('DX')).toBe('factura');
    expect(normalizeTipo('CX')).toBe('cobranza');
    expect(normalizeTipo('Nota de Débito')).toBe('factura');
    expect(normalizeTipo('Nota de Crédito')).toBe('cobranza');
    expect(normalizeTipo('nota de debito')).toBe('factura');
    expect(normalizeTipo('Nota de Crédito')).toBe('cobranza');
  });
});

describe('parseo de importes (task 5.6)', () => {
  it.each([
    ['$ 300.00', 300],
    ['$ 1,234.56', 1234.56],
    ['1.234,56', 1234.56],
    ['$ 12,345', 12345],
    ['300,50', 300.5],
    ['$ 1,234,567.89', 1234567.89],
    ['  $   450.00 ', 450],
    ['-1,000.00', 1000],
  ])('interpreta %s como %d', (raw, esperado) => {
    expect(parseImporte(raw)).toBe(esperado);
  });

  it('falla explícitamente con importes ilegibles', () => {
    expect(() => parseImporte('')).toThrow(ExtraccionError);
    expect(() => parseImporte('N/A')).toThrow(ExtraccionError);
  });
});

describe('interpretación de fechas (task 5.7)', () => {
  it('lee día primero, mes después: 03/10/2026 es 3 de octubre, no 10 de marzo', () => {
    const fecha = parseFecha('03/10/2026 12:59:40');
    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth()).toBe(9); // octubre
    expect(fecha.getDate()).toBe(3);
    expect(fecha.getHours()).toBe(12);
    expect(fecha.getMinutes()).toBe(59);
    expect(fecha.getSeconds()).toBe(40);
  });

  it('acepta el resto de formatos del portal', () => {
    expect(parseFecha('01/10/2026 07:49:55').getDate()).toBe(1);
    expect(parseFecha('16/02/2025 16:52:44').getMonth()).toBe(1);
    expect(parseFecha('03/10/2026').getHours()).toBe(0);
  });

  it('rechaza fechas ISO o imposibles en lugar de adivinar', () => {
    expect(() => parseFecha('2026-10-03')).toThrow(ExtraccionError);
    expect(() => parseFecha('31/02/2026 10:00:00')).toThrow(ExtraccionError);
    expect(() => parseFecha('13/13/2026 10:00:00')).toThrow(ExtraccionError);
  });
});

describe('referencia de cobranza (task 5.9)', () => {
  it('mapea el guion a cadena vacía', () => {
    expect(parseReferencia('-')).toBe('');
    expect(parseReferencia('  -  ')).toBe('');
    expect(parseReferencia('')).toBe('');
  });

  it('conserva la referencia real', () => {
    expect(parseReferencia('Bnacomer Nicolas => Caja Ciber')).toBe('Bnacomer Nicolas => Caja Ciber');
  });
});

describe('detalle literal (task 5.8 / D7)', () => {
  it('no infiere el periodo desde la fecha', () => {
    const [mov] = normalizeMovimientos([
      filaFake({ detalle: 'MES DE MAYO', fecha: '15/07/2026 08:00:00', tipo: 'Factura' }),
    ]);
    expect(mov?.detalle).toBe('MES DE MAYO');
    expect(mov?.fecha.getMonth()).toBe(6); // julio, como lo registró el portal
  });
});

describe('mapeo completo de fila cruda (task 3.4/5.x)', () => {
  it('convierte la fila del portal a movimiento normalizado', () => {
    const [mov] = normalizeMovimientos([
      filaFake({
        tipo: 'Cobranza',
        numero: '9720',
        cobranza: 'Bnacomer Nicolas => Caja Ciber',
        detalle: 'MES DE OCTUBRE HSBC420677',
        importe: '$ 300.00',
        fecha: '03/10/2026 12:59:40',
        balance: '$ 600.00',
        idMovimiento: '9720',
      }),
    ]);
    expect(mov).toMatchObject({
      tipo: 'cobranza',
      numero: '9720',
      referencia: 'Bnacomer Nicolas => Caja Ciber',
      detalle: 'MES DE OCTUBRE HSBC420677',
      importe: 300,
      balancePortal: 600,
      idMovimiento: '9720',
    });
    expect(mov?.fecha.getFullYear()).toBe(2026);
  });

  it('propaga el error con el número de fila cuando el tipo no se reconoce', () => {
    expect(() => normalizeMovimientos([filaFake(), filaFake({ tipo: '' })])).toThrowError(/Fila 2/);
  });
});
