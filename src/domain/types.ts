/** Tipos de dominio del estado de cuenta (tarea 3.4). */

export type TipoMovimiento = 'factura' | 'cobranza';

/**
 * Fila cruda tal como la entrega la fuente, antes de normalizar.
 * `tipo` conserva el texto original de la fuente:
 *  - HTML: el atributo `title` del `<tr>` (`Factura` | `Cobranza`).
 *  - XLSX: la celda `Tipo` (`FX` | `CO`).
 */
export interface RawMovimiento {
  tipo: string;
  numero: string;
  /** Referencia de cobranza; el portal usa `-` cuando no aplica. */
  cobranza: string;
  detalle: string;
  importe: string;
  fecha: string;
  balance: string;
  /** Identificador extraído del `onclick` de la fila (sólo HTML). */
  idMovimiento?: string;
}

export interface Movimiento {
  tipo: TipoMovimiento;
  numero: string;
  /** Referencia de cobranza; cadena vacía cuando no aplica. */
  referencia: string;
  /** Copiado literalmente del portal, sin interpretar (D7). */
  detalle: string;
  /** Magnitud absoluta en unidades de moneda. */
  importe: number;
  /** Fecha interpretada como `dd/mm/aaaa hh:mm:ss` del portal. */
  fecha: Date;
  /** Balance reportado por el portal; se conserva por referencia, NUNCA se calcula con él (D4). */
  balancePortal: number | null;
  /** Referencia interna (`/cobranza/ver/{id}` o `/factura/ver/FX/{id}`). */
  idMovimiento: string | null;
}

export interface ServicioCliente {
  tipo: string;
  plan: string;
  nombre: string;
  costo: number;
}

export interface ClienteIwisP {
  id: string;
  nombre: string;
  direccion: string | null;
  localidad: string | null;
  rfc: string | null;
  tipoServicio: string | null;
  celular: string | null;
  servicios: ServicioCliente[];
  /** Saldo reportado por `getClient` (fuente autorizada del saldo, task 6.4/6.5). */
  saldoReportado: number;
}

export interface ClienteDeudor {
  id: string;
  nombre: string;
  celular: string | null;
  deuda: number;
}

export interface Totales {
  totalFacturado: number;
  totalCobrado: number;
  saldoPendiente: number;
}

export interface VerificacionSaldo {
  calculado: number;
  reportado: number;
  coincide: boolean;
}

export interface ResultadoEstadoCuenta {
  cliente: ClienteIwisP;
  movimientos: Movimiento[];
  totales: Totales;
  verificacion: VerificacionSaldo;
  /** Aviso al operador cuando los saldos difieren (task 6.6): no bloquea la generación. */
  advertencias: string[];
}
