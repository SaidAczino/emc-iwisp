/**
 * Normalización de filas crudas a `Movimiento` (capacidad `movimiento-normalization`,
 * tasks 5.5–5.9). Todas las funciones son puras: se prueban sin red.
 */
import { ExtraccionError } from '../domain/errors.js';
import type { Movimiento, RawMovimiento, TipoMovimiento } from '../domain/types.js';

/**
 * Tarea 5.5 — normaliza el tipo a `factura` / `cobranza`.
 * Acepta el `title` del HTML (`Factura`, `Cobranza`, `Nota de Débito`,
 * `Nota de Crédito`) y la celda `Tipo` del XLSX (`FX`, `CO`, `DX`, `CX`).
 * Cualquier otra cosa es estructura no reconocida.
 *
 * `DX`/`CX` (y sus `title` de nota débito/crédito) se clasificaron de forma
 * empírica contra `getClient.balance` en la validación (tasks 9.1/9.2):
 * sumar `DX` como cargo y `CX` como abono reproduce el saldo del portal en
 * todos los clientes verificados; las hipótesis contrarias no.
 */
export function normalizeTipo(rawTipo: string): TipoMovimiento {
  const value = normalizarEtiqueta(rawTipo);
  if (value === 'factura' || value === 'fx' || value === 'dx' || value === 'nota de debito') return 'factura';
  if (value === 'cobranza' || value === 'co' || value === 'cx' || value === 'nota de credito') return 'cobranza';
  throw new ExtraccionError(`Tipo de movimiento no reconocido: "${rawTipo}"`);
}

/** Minúsculas, sin acentos y con espacios colapsados: "Nota de Débito" => "nota de debito". */
function normalizarEtiqueta(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Tarea 5.6 — importe a magnitud absoluta: sin símbolo de moneda, sin espacios
 * y sin separadores de miles. Se aceptan ambos separadores (1,234.56 y 1.234,56).
 */
export function parseImporte(raw: string): number {
  const original = raw;
  let s = raw.replace(/[$\s\u00A0]/g, '').replace(/[^\d.,-]/g, '');
  if (s === '' || s === '-' || s === '.') {
    throw new ExtraccionError(`Importe no reconocido: "${original}"`);
  }

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastDot > lastComma) s = s.replace(/,/g, ''); // 1,234.56
    else s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  } else if (lastComma !== -1) {
    // Un coma seguido de 1–2 dímites finales => coma decimal; si no, separador de miles.
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  }

  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) throw new ExtraccionError(`Importe no reconocido: "${original}"`);
  return Math.abs(n);
}

/**
 * Tarea 5.7 — fecha `dd/mm/aaaa hh:mm:ss`, SIEMPRE interpretada a mano.
 * Nunca se pasa la cadena a `new Date()`: "03/10/2026" sería marzo 10.
 */
export function parseFecha(raw: string): Date {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!m) {
    throw new ExtraccionError(`Fecha no reconocida: "${raw}" (se espera dd/mm/aaaa hh:mm:ss)`);
  }
  const [, d, mo, y, h, mi, s] = m;
  const dia = Number(d);
  const mes = Number(mo);
  const anio = Number(y);
  const hora = Number(h ?? 0);
  const minuto = Number(mi ?? 0);
  const segundo = Number(s ?? 0);

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59 || segundo > 59) {
    throw new ExtraccionError(`Fecha fuera de rango: "${raw}"`);
  }
  const fecha = new Date(anio, mes - 1, dia, hora, minuto, segundo);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
    throw new ExtraccionError(`Fecha inexistente en el calendario: "${raw}"`);
  }
  return fecha;
}

/** Tarea 5.9 — la referencia de cobranza vacía (`-`) se vuelve cadena vacía. */
export function parseReferencia(raw: string): string {
  const v = raw.trim();
  return v === '-' ? '' : v;
}

function parseBalanceOpcional(raw: string): number | null {
  const v = raw.trim();
  if (v === '' || v === '-') return null;
  try {
    return parseImporte(v);
  } catch {
    return null;
  }
}

/**
 * Convierte las filas crudas en movimientos normalizados.
 * El `detalle` se copia literal (tarea 5.8 / D7): pasa tal cual, sin
 * interpretarlo ni normalizarlo.
 */
export function normalizeMovimientos(raws: RawMovimiento[]): Movimiento[] {
  return raws.map((raw, index) => {
    let tipo: TipoMovimiento;
    try {
      tipo = normalizeTipo(raw.tipo);
    } catch (err) {
      throw new ExtraccionError(`Fila ${index + 1}: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
    return {
      tipo,
      numero: raw.numero.trim(),
      referencia: parseReferencia(raw.cobranza),
      detalle: raw.detalle,
      importe: parseImporte(raw.importe),
      fecha: parseFecha(raw.fecha),
      balancePortal: parseBalanceOpcional(raw.balance),
      idMovimiento: raw.idMovimiento?.trim() || null,
    };
  });
}
