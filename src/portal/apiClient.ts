/**
 * Cliente de la API de I-WISP (tasks 4.3, 4.4, 4.5 y 8.1).
 *
 * Descubierto en el spike (design.md → Open Questions):
 *  - `GET` y query string devuelven `400`; sólo funciona **POST JSON**.
 *  - `getClient` exige `idcliente` (no `id`).
 *  - `getClientDebt` se documenta con `api`, pero el servidor exige `api_key`.
 *  - `406`/`404` = cliente inexistente; `401` = API key rechazada; `400` = petición mal formada.
 */
import type { Config } from '../config.js';
import { AuthError, ClienteNoEncontradoError, IwispError, PortalNoDisponibleError } from '../domain/errors.js';
import type { ClientSource, DebtSource } from '../domain/ports.js';
import type { ClienteDeudor, ClienteIwisP, ServicioCliente } from '../domain/types.js';
import type { Logger } from '../log.js';
import { UndiciHttpClient, type HttpClient, type HttpResponse } from './http.js';

interface RawServicio {
  tipo?: string;
  plan?: string;
  nombre?: string;
  costo?: string;
}

interface RawCliente {
  id?: string;
  nombre?: string;
  direccion?: string;
  localidad?: string;
  rfc?: string;
  tipo?: string;
  celular?: string;
  balance?: string;
  servicios?: RawServicio[];
}

interface RawDeudor {
  id?: string;
  nombre?: string;
  celular?: string;
  deuda?: string;
}

function numero(valor: string | undefined): number {
  const n = Number.parseFloat((valor ?? '0').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function texto(valor: string | undefined): string | null {
  const v = (valor ?? '').trim();
  return v === '' || v === '-' ? null : v;
}

/** Mapea la respuesta de `getClient` al tipo `ClienteIwisP` (task 4.4). */
export function mapCliente(raw: RawCliente): ClienteIwisP {
  const servicios: ServicioCliente[] = (raw.servicios ?? []).map((s) => ({
    tipo: s.tipo ?? '',
    plan: s.plan ?? '',
    nombre: s.nombre ?? '',
    costo: numero(s.costo),
  }));
  return {
    id: String(raw.id ?? ''),
    nombre: raw.nombre ?? '',
    direccion: texto(raw.direccion),
    localidad: texto(raw.localidad),
    rfc: texto(raw.rfc),
    tipoServicio: texto(raw.tipo),
    celular: texto(raw.celular),
    servicios,
    saldoReportado: numero(raw.balance),
  };
}

export interface IwispApiClientOptions {
  config: Config;
  logger: Logger;
  http?: HttpClient;
}

export class IwispApiClient implements ClientSource, DebtSource {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly http: HttpClient;

  constructor(options: IwispApiClientOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.http = options.http ?? new UndiciHttpClient();
  }

  async fetchCliente(idCliente: string): Promise<ClienteIwisP> {
    const res = await this.postJson('/api/getClient', { api_key: this.config.apiKey, idcliente: Number(idCliente) });
    await this.assertStatus(res, idCliente, '/api/getClient');
    const raw = await this.parseJson<RawCliente>(res, '/api/getClient');
    if (raw.id === undefined) throw new ClienteNoEncontradoError(idCliente);
    const cliente = mapCliente(raw);
    this.logger.debug(`Cliente ${cliente.id} obtenido de getClient (saldo reportado ${cliente.saldoReportado})`);
    return cliente;
  }

  async fetchClientesConAdeudo(): Promise<ClienteDeudor[]> {
    const res = await this.postJson('/api/getClientDebt', { api_key: this.config.apiKey });
    await this.assertStatus(res, null, '/api/getClientDebt');
    const rows = await this.parseJson<RawDeudor[]>(res, '/api/getClientDebt');
    if (!Array.isArray(rows)) {
      throw new IwispError('API', 'Respuesta inesperada de /api/getClientDebt: se esperaba una lista');
    }
    return rows
      .filter((r) => r.id !== undefined)
      .map((r) => ({
        id: String(r.id),
        nombre: r.nombre ?? '',
        celular: texto(r.celular),
        deuda: numero(r.deuda),
      }));
  }

  private async postJson(path: string, body: unknown): Promise<HttpResponse> {
    let res: HttpResponse;
    try {
      res = await this.http.request(this.config.baseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new PortalNoDisponibleError(`No se pudo contactar a ${path}`, { cause: err });
    }
    return res;
  }

  /** Tarea 4.5: cliente inexistente como error identificable, distinto de un fallo de autenticación. */
  private async assertStatus(res: HttpResponse, idCliente: string | null, path: string): Promise<void> {
    if (res.status === 200) return;
    if (res.status === 406 || res.status === 404) {
      throw new ClienteNoEncontradoError(idCliente ?? 'desconocido');
    }
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(`La API Key fue rechazada por ${path} (${res.status})`);
    }
    if (res.status === 400) {
      throw new IwispError('API', `${path} rechazó la petición (400): revisa los parámetros`);
    }
    throw new PortalNoDisponibleError(`${path} respondió ${res.status}`);
  }

  private async parseJson<T>(res: HttpResponse, path: string): Promise<T> {
    const body = await res.text();
    try {
      return JSON.parse(body) as T;
    } catch (err) {
      throw new PortalNoDisponibleError(`${path} devolvió una respuesta que no es JSON`, { cause: err });
    }
  }
}
