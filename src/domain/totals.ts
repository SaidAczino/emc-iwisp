/**
 * Cálculo de totales y verificación de saldo (tasks 6.1–6.8 / D4 / D5).
 *
 * La columna `balance` del portal NUNCA entra en ningún cálculo (task 6.4):
 * sólo se conserva en `Movimiento.balancePortal` como referencia.
 */
import type { Movimiento, Totales, VerificacionSaldo } from './types.js';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatoMoneda(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
}

/** Tasks 6.1–6.3. */
export function calcularTotales(movimientos: Movimiento[]): Totales {
  let totalFacturado = 0;
  let totalCobrado = 0;
  for (const m of movimientos) {
    if (m.tipo === 'factura') totalFacturado += m.importe;
    else totalCobrado += m.importe;
  }
  const facturado = round2(totalFacturado);
  const cobrado = round2(totalCobrado);
  return { totalFacturado: facturado, totalCobrado: cobrado, saldoPendiente: round2(facturado - cobrado) };
}

/** Task 6.5 — compara el saldo calculado contra `getClient.balance`. */
export function verificarSaldo(totales: Totales, saldoReportado: number): VerificacionSaldo {
  const reportado = round2(saldoReportado);
  return { calculado: totales.saldoPendiente, reportado, coincide: totales.saldoPendiente === reportado };
}

/** Task 6.6 — advertencia al operador que NO bloquea la generación. */
export function advertenciaDeSaldo(verificacion: VerificacionSaldo): string | null {
  if (verificacion.coincide) return null;
  return (
    `Saldo discrepante: el histórico calculado da ${formatoMoneda(verificacion.calculado)} pero I-WISP reporta ` +
    `${formatoMoneda(verificacion.reportado)}. Los datos extraídos podrían estar incompletos; revise antes de entregar.`
  );
}

/** Task 6.7 — orden cronológico ascendente para el PDF. */
export function ordenarCronologicamente(movimientos: Movimiento[]): Movimiento[] {
  return [...movimientos].sort((a, b) => {
    const diff = a.fecha.getTime() - b.fecha.getTime();
    if (diff !== 0) return diff;
    // Desempate estable por tipo+número para filas con el mismo segundo.
    const tipo = a.tipo.localeCompare(b.tipo);
    return tipo !== 0 ? tipo : a.numero.localeCompare(b.numero, undefined, { numeric: true });
  });
}
