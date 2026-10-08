/** Punto de entrada de la aplicación interna. */
import { loadConfig } from '../config.js';
import { Redactor, createLogger } from '../log.js';
import { IwispApiClient } from '../portal/apiClient.js';
import { HttpPortalSession } from '../portal/session.js';
import { HtmlMovementSource } from '../sources/htmlSource.js';
import { XlsxMovementSource } from '../sources/xlsxSource.js';
import { CompositeMovementSource } from '../sources/composite.js';
import { PdfRenderer } from '../pdf/render.js';
import { GeneradorEstadoCuenta } from '../service/generar.js';
import { buildApp } from './app.js';

const config = loadConfig();

// Tarea 2.4 — registrar los secretos ANTES de que el logger pueda verlos.
const redactor = new Redactor();
redactor.register(config.apiKey, config.password, config.username);
const logger = createLogger({
  redactor,
  level: config.logLevel,
});

const session = new HttpPortalSession({ config, logger });
const api = new IwispApiClient({ config, logger });
const movementSource = new CompositeMovementSource(
  new XlsxMovementSource(session, logger),
  new HtmlMovementSource(session, logger),
  logger,
);
const renderer = new PdfRenderer();
const generador = new GeneradorEstadoCuenta({ session, clientSource: api, movementSource, renderer, logger });

const app = buildApp({ session, debtSource: api, generador, logger });

const port = config.port;
const server = app.listen(port, () => {
  logger.info(`Estado de cuenta EMC escuchando en http://localhost:${port}`);
});

async function apagar(signal: string): Promise<void> {
  logger.info(`Señal ${signal}: cerrando servidor y navegador PDF`);
  server.close();
  await renderer.close();
  process.exit(0);
}

process.on('SIGINT', () => void apagar('SIGINT'));
process.on('SIGTERM', () => void apagar('SIGTERM'));
