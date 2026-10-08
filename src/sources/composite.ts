/**
 * Composite de fuentes (task 5.4 / D2): XLSX primario con degradación al
 * HTML si falla o no entrega datos legibles. Ninguna otra parte del sistema
 * sabe cuál se usó.
 */
import { ExtraccionError } from '../domain/errors.js';
import type { MovementSource } from '../domain/ports.js';
import type { RawMovimiento } from '../domain/types.js';
import type { Logger } from '../log.js';

export class CompositeMovementSource implements MovementSource {
  constructor(
    private readonly primary: MovementSource,
    private readonly fallback: MovementSource,
    private readonly logger?: Logger,
  ) {}

  async fetchMovimientos(idCliente: string): Promise<RawMovimiento[]> {
    try {
      const rows = await this.primary.fetchMovimientos(idCliente);
      if (rows.length > 0) return rows;
      this.logger?.warn(`Fuente primaria sin movimientos para ${idCliente}; se recurre al respaldo HTML`);
    } catch (err) {
      this.logger?.warn(`Fuente primaria falló para ${idCliente}; se recurre al respaldo HTML`, err);
    }

    const rows = await this.fallback.fetchMovimientos(idCliente);
    if (rows.length === 0) {
      throw new ExtraccionError(`Ninguna fuente entregó movimientos para el cliente ${idCliente}`);
    }
    return rows;
  }
}
