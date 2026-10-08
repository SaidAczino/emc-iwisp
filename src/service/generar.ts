/**
 * Orquestación del estado de cuenta: sesión -> datos maestros -> movimientos
 * -> normalización -> totales -> PDF.
 */
import { construirResultadoEstadoCuenta } from '../domain/estadoCuenta.js';
import { normalizeMovimientos } from '../sources/parse.js';
import type { ClientSource, MovementSource, PortalSession } from '../domain/ports.js';
import type { ResultadoEstadoCuenta } from '../domain/types.js';
import type { Logger } from '../log.js';
import { PdfRenderer, exigirMovimientos, nombreArchivoEstadoCuenta } from '../pdf/render.js';
import { renderEstadoCuentaHtml } from '../pdf/template.js';

export interface DocumentoEstadoCuenta {
  resultado: ResultadoEstadoCuenta;
  html: string;
  pdf: Uint8Array;
  filename: string;
}

export interface GeneradorDeps {
  session: PortalSession;
  clientSource: ClientSource;
  movementSource: MovementSource;
  renderer: PdfRenderer;
  logger: Logger;
}

export class GeneradorEstadoCuenta {
  constructor(private readonly deps: GeneradorDeps) {}

  async generar(idCliente: string): Promise<DocumentoEstadoCuenta> {
    const { session, clientSource, movementSource, renderer, logger } = this.deps;

    // Task 8.6 — sesión vigente antes de operar el portal.
    await session.ensure();

    const cliente = await clientSource.fetchCliente(idCliente);
    const raws = await movementSource.fetchMovimientos(idCliente);
    const movimientos = normalizeMovimientos(raws);
    const resultado = construirResultadoEstadoCuenta(cliente, movimientos);

    for (const advertencia of resultado.advertencias) logger.warn(advertencia);
    logger.info(
      `Estado de cuenta del cliente ${cliente.id}: ${resultado.movimientos.length} movimientos, ` +
        `saldo histórico ${resultado.totales.saldoPendiente}, saldo I-WISP ${resultado.verificacion.reportado}`,
    );

    exigirMovimientos(resultado);
    const html = renderEstadoCuentaHtml(resultado);
    const pdf = await renderer.render(html);
    const filename = nombreArchivoEstadoCuenta(cliente);

    return { resultado, html, pdf, filename };
  }
}
