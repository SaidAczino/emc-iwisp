/**
 * Compone el resultado del estado de cuenta a partir de los datos maestros y
 * los movimientos normalizados (tasks 6.1–6.7).
 */
import { SinMovimientosError } from './errors.js';
import { advertenciaDeSaldo, calcularTotales, ordenarCronologicamente, verificarSaldo } from './totals.js';
import type { ClienteIwisP, Movimiento, ResultadoEstadoCuenta } from './types.js';

/** Task 7.9 — sin movimientos no hay documento: se reporta, no se genera. */
export function construirResultadoEstadoCuenta(cliente: ClienteIwisP, movimientos: Movimiento[]): ResultadoEstadoCuenta {
  if (movimientos.length === 0) throw new SinMovimientosError(cliente.id);

  const ordenados = ordenarCronologicamente(movimientos);
  const totales = calcularTotales(ordenados);
  const verificacion = verificarSaldo(totales, cliente.saldoReportado);
  const advertencias: string[] = [];
  const advertencia = advertenciaDeSaldo(verificacion);
  if (advertencia) advertencias.push(advertencia);

  return { cliente, movimientos: ordenados, totales, verificacion, advertencias };
}
