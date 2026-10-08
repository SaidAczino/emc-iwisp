/** Errores identificables: el operador siempre debe poder distinguir la causa (tasks 4.5, 5.11, 8.5). */

export class IwispError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Fallo de autenticación / sesión contra el portal. Distinto de "cliente inexistente". */
export class AuthError extends IwispError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('AUTH', message, options);
  }
}

/** El identificador no corresponde a ningún cliente (tarea 4.5). */
export class ClienteNoEncontradoError extends IwispError {
  constructor(idCliente: string) {
    super('CLIENTE_NO_ENCONTRADO', `El cliente ${idCliente} no existe en I-WISP`);
  }
}

/** La extracción no produjo movimientos o su estructura no es la esperada (tasks 5.3, 5.11). */
export class ExtraccionError extends IwispError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('EXTRACCION', message, options);
  }
}

/** El cliente no tiene movimientos: no se genera documento (task 7.9). */
export class SinMovimientosError extends IwispError {
  constructor(idCliente: string) {
    super('SIN_MOVIMIENTOS', `El cliente ${idCliente} no tiene movimientos; no se genera el documento`);
  }
}

/** El portal no respondió o respondió con un error (spec iwisp-portal-access). */
export class PortalNoDisponibleError extends IwispError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('PORTAL_NO_DISPONIBLE', message, options);
  }
}
