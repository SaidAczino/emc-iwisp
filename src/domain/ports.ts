import type { ClienteDeudor, ClienteIwisP, RawMovimiento } from './types.js';

/** Sesión establecida contra el portal (tarea 3.1). */
export interface Session {
  cookieHeader: string;
  /** Marca de tiempo (ms) a partir de la cual la sesión se considera no vigente. */
  expiresAt: number;
}

/**
 * Tarea 3.1 — contrato de sesión del portal.
 * El scraper, la API y el PDF nunca saben si debajo hay `fetch` nativo o un
 * navegador automatizado (decisión D3).
 */
export interface PortalSession {
  ensure(): Promise<Session>;
  fetchPage(path: string): Promise<string>;
  /** Descarga binaria con la misma sesión (necesaria para la fuente XLSX, D2). */
  fetchFile(path: string): Promise<{ contentType: string; bytes: Uint8Array }>;
}

/** Tarea 3.2 — fuente de movimientos de cuenta corriente (D2). */
export interface MovementSource {
  fetchMovimientos(idCliente: string): Promise<RawMovimiento[]>;
}

/** Tarea 3.3 — fuente de datos maestros del cliente. */
export interface ClientSource {
  fetchCliente(idCliente: string): Promise<ClienteIwisP>;
}

/** Listado de clientes con adeudo (capacidad `clientes-deudores-ui`, tarea 8.1). */
export interface DebtSource {
  fetchClientesConAdeudo(): Promise<ClienteDeudor[]>;
}
