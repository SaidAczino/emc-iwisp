/**
 * Aplicación web (capacidad `clientes-deudores-ui`, tasks 8.1–8.6).
 * Express + EJS: sin build de frontend, adecuado para 4 usuarios.
 */
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  AuthError,
  ClienteNoEncontradoError,
  ExtraccionError,
  IwispError,
  PortalNoDisponibleError,
  SinMovimientosError,
} from '../domain/errors.js';
import type { DebtSource, PortalSession } from '../domain/ports.js';
import type { Logger } from '../log.js';
import type { GeneradorEstadoCuenta } from '../service/generar.js';

export interface AppDeps {
  session: PortalSession;
  debtSource: DebtSource;
  generador: GeneradorEstadoCuenta;
  logger: Logger;
}

function viewsDir(): string {
  const candidates = [`${process.cwd()}/views`, `${dirname(fileURLToPath(import.meta.url))}/../../views`];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`No se encontró el directorio de vistas (probado: ${candidates.join(', ')})`);
  return found;
}

/** Task 8.5 — causa identificable para cada tipo de fallo. */
export function estadoHttpDeError(err: unknown): { status: number; causa: string } {
  if (err instanceof ClienteNoEncontradoError) return { status: 404, causa: err.message };
  if (err instanceof SinMovimientosError) return { status: 409, causa: err.message };
  if (err instanceof AuthError) return { status: 401, causa: err.message };
  if (err instanceof ExtraccionError) return { status: 502, causa: err.message };
  if (err instanceof PortalNoDisponibleError) return { status: 502, causa: err.message };
  if (err instanceof IwispError) return { status: 500, causa: `${err.code}: ${err.message}` };
  const message = err instanceof Error ? err.message : String(err);
  return { status: 500, causa: `Error inesperado: ${message}` };
}

export function buildApp(deps: AppDeps): express.Express {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', viewsDir());

  // Task 8.6 — sesión antes de obtener el listado; 8.1 — listado desde getClientDebt.
  app.get('/', async (_req: Request, res: Response) => {
    try {
      await deps.session.ensure();
      const clientes = await deps.debtSource.fetchClientesConAdeudo();
      res.render('index', { clientes, error: null });
    } catch (err) {
      const { status, causa } = estadoHttpDeError(err);
      deps.logger.error('No se pudo obtener el listado de clientes con adeudo', err);
      res.status(status).render('index', { clientes: [], error: causa });
    }
  });

  // Tasks 8.4 y 8.5 — descarga por fila; el PDF se genera COMPLETO antes de enviarlo.
  app.get('/clientes/:id/estado-cuenta.pdf', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const documento = await deps.generador.generar(req.params.id ?? '');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${documento.filename}"`);
      res.setHeader('Content-Length', String(documento.pdf.byteLength));
      res.end(Buffer.from(documento.pdf));
    } catch (err) {
      const { status, causa } = estadoHttpDeError(err);
      deps.logger.error(`Fallo al generar el estado de cuenta del cliente ${req.params.id}`, err);
      try {
        res.status(status).render('error', { causa, status });
      } catch (renderErr) {
        next(renderErr);
      }
    }
  });

  return app;
}
