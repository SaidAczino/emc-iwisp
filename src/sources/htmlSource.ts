/**
 * Fuente HTML de movimientos (tasks 5.1, 5.2, 5.3, 5.10, 5.11) sobre
 * `/clientes/facturas_cobranza/{id}` — respaldo del D2.
 */
import * as cheerio from 'cheerio';
import { ExtraccionError } from '../domain/errors.js';
import type { MovementSource, PortalSession } from '../domain/ports.js';
import type { RawMovimiento } from '../domain/types.js';
import type { Logger } from '../log.js';

/** Las 7 columnas fijas del portal: Tipo | Número | Cobranza | Detalle | Importe | Fecha | Balance. */
export const COLUMNAS_ESPERADAS = 7;

/** Tarea 5.10 — identificador desde el `onclick` de la fila. */
function idDesdeOnclick(onclick: string | undefined): string | undefined {
  if (!onclick) return undefined;
  return onclick.match(/\/(?:cobranza|factura)\/ver\/(?:FX\/)?(\d+)/)?.[1];
}

export class HtmlMovementSource implements MovementSource {
  constructor(
    private readonly session: PortalSession,
    private readonly logger?: Logger,
  ) {}

  async fetchMovimientos(idCliente: string): Promise<RawMovimiento[]> {
    const path = `/clientes/facturas_cobranza/${encodeURIComponent(idCliente)}`;
    const html = await this.session.fetchPage(path);
    const $ = cheerio.load(html);
    const table = $('#tabla_cta_cte_reducida');
    if (table.length === 0) {
      throw new ExtraccionError(`No se encontró la tabla #tabla_cta_cte_reducida en ${path} (cambió el markup)`);
    }

    const dataRows = table.find('tr').filter((_, el) => $(el).find('td').length > 0);

    // Tarea 5.11 — cero movimientos: error explícito, nunca un PDF vacío.
    if (dataRows.length === 0) {
      throw new ExtraccionError(`Sin movimientos para el cliente ${idCliente}: la tabla de cuenta corriente está vacía`);
    }

    const out: RawMovimiento[] = [];
    dataRows.each((_, el) => {
      const row = $(el);
      // Tarea 5.2 — el tipo sale EXCLUSIVAMENTE del atributo `title` (D8),
      // nunca del `style` ni del texto de la celda.
      const title = row.attr('title');
      if (!title) {
        throw new ExtraccionError(`Fila de movimiento sin atributo title en ${path}: estructura no reconocida (D8)`);
      }

      const celdas: string[] = [];
      row.find('td').each((__, td) => {
        celdas.push($(td).text().replace(/\u00a0/g, ' ').trim());
      });

      // Tarea 5.3 — número exacto de celdas; si cambió, fallamos explícitamente.
      if (celdas.length !== COLUMNAS_ESPERADAS) {
        throw new ExtraccionError(
          `Fila con ${celdas.length} celdas en ${path}; se esperaban ${COLUMNAS_ESPERADAS} (estructura cambió)`,
        );
      }

      out.push({
        tipo: title,
        numero: celdas[1] ?? '',
        cobranza: celdas[2] ?? '',
        detalle: celdas[3] ?? '',
        importe: celdas[4] ?? '',
        fecha: celdas[5] ?? '',
        balance: celdas[6] ?? '',
        idMovimiento: idDesdeOnclick(row.attr('onclick')),
      });
    });

    this.logger?.debug(`HTML: ${out.length} movimientos extraídos para el cliente ${idCliente}`);
    return out;
  }
}
