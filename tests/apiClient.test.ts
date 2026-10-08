import { describe, expect, it } from 'vitest';
import type { Config } from '../src/config.js';
import { AuthError, ClienteNoEncontradoError, PortalNoDisponibleError } from '../src/domain/errors.js';
import { Redactor, createLogger } from '../src/log.js';
import { IwispApiClient, mapCliente } from '../src/portal/apiClient.js';
import type { HttpClient, HttpRequestInit, HttpResponse } from '../src/portal/http.js';

const BASE = 'https://portal.test';

function config(): Config {
  return {
    apiKey: 'K-test-key',
    wispId: '331',
    username: 'u',
    password: 'p',
    baseUrl: BASE,
    outputDir: 'output',
    sessionTtlMs: 60_000,
    port: 3000,
    logLevel: 'info',
  };
}

class JsonResponse implements HttpResponse {
  constructor(
    private readonly status_: number,
    private readonly body: string,
  ) {}

  get status(): number {
    return this.status_;
  }

  getHeader(): string | null {
    return 'application/json';
  }

  getSetCookies(): string[] {
    return [];
  }

  async text(): Promise<string> {
    return this.body;
  }

  async bytes(): Promise<Uint8Array> {
    return new TextEncoder().encode(this.body);
  }
}

class RecordingHttp implements HttpClient {
  readonly bodies: Array<{ url: string; body?: string }> = [];
  constructor(private readonly response: HttpResponse) {}

  async request(url: string, init: HttpRequestInit = {}): Promise<HttpResponse> {
    this.bodies.push({ url, body: init.body });
    return this.response;
  }
}

function cliente(http: HttpClient): IwispApiClient {
  return new IwispApiClient({ config: config(), logger: createLogger({ redactor: new Redactor() }), http });
}

const RAW_CLIENTE = {
  id: '453',
  nombre: 'Marnay Sarmiento',
  solo_nombre: 'Marnay',
  tipo: 'Con plan',
  balance: '600.00',
  celular: '5624150665',
  direccion: 'Hulum 22',
  localidad: 'Paseos del Lago 2,Zumpango,Estado de México',
  rfc: '',
  servicios: [
    { id: '440', tipo: 'W', plan: '10', nombre: 'WI-Plan300_10M_Zumpango', costo: '300.00', ip: ['10.1.72.42'] },
  ],
};

describe('ClientSource contra /api/getClient (tasks 4.3 y 4.4)', () => {
  it('envía POST JSON con api_key e idcliente (no GET/query: eso devuelve 400)', async () => {
    const http = new RecordingHttp(new JsonResponse(200, JSON.stringify(RAW_CLIENTE)));
    await cliente(http).fetchCliente('453');

    expect(http.bodies[0]?.url).toBe(`${BASE}/api/getClient`);
    expect(JSON.parse(http.bodies[0]?.body ?? '{}')).toEqual({ api_key: 'K-test-key', idcliente: 453 });
  });

  it('mapea la respuesta al tipo ClienteIwisP', async () => {
    const http = new RecordingHttp(new JsonResponse(200, JSON.stringify(RAW_CLIENTE)));
    const c = await cliente(http).fetchCliente('453');

    expect(c).toEqual({
      id: '453',
      nombre: 'Marnay Sarmiento',
      direccion: 'Hulum 22',
      localidad: 'Paseos del Lago 2,Zumpango,Estado de México',
      rfc: null, // vacío => sin RFC, se muestra como "no disponible"
      tipoServicio: 'Con plan',
      celular: '5624150665',
      servicios: [{ tipo: 'W', plan: '10', nombre: 'WI-Plan300_10M_Zumpango', costo: 300 }],
      saldoReportado: 600,
    });
  });
});

describe('errores identificables (task 4.5)', () => {
  it('cliente inexistente (406) => ClienteNoEncontradoError', async () => {
    const http = new RecordingHttp(new JsonResponse(406, ''));
    await expect(cliente(http).fetchCliente('999999')).rejects.toBeInstanceOf(ClienteNoEncontradoError);
  });

  it('API key rechazada (401) => AuthError, distinto del caso anterior', async () => {
    const http = new RecordingHttp(new JsonResponse(401, ''));
    const promesa = cliente(http).fetchCliente('453');
    await expect(promesa).rejects.toBeInstanceOf(AuthError);
    await expect(cliente(new RecordingHttp(new JsonResponse(401, ''))).fetchCliente('453')).rejects.not.toBeInstanceOf(
      ClienteNoEncontradoError,
    );
  });

  it('portal caído o sin JSON => PortalNoDisponibleError', async () => {
    await expect(
      cliente({
        async request() {
          throw new Error('ECONNREFUSED');
        },
      }).fetchCliente('453'),
    ).rejects.toBeInstanceOf(PortalNoDisponibleError);

    await expect(
      cliente(new RecordingHttp(new JsonResponse(200, '<html>oops</html>'))).fetchCliente('453'),
    ).rejects.toBeInstanceOf(PortalNoDisponibleError);
  });
});

describe('listado de deudores (task 8.1)', () => {
  it('usa POST JSON con api_key (la documentación dice `api`, el servidor exige api_key)', async () => {
    const http = new RecordingHttp(
      new JsonResponse(200, JSON.stringify([{ id: '4', nombre: 'Michel', celular: '7721346423', deuda: '1000.00' }])),
    );
    const deudores = await cliente(http).fetchClientesConAdeudo();

    expect(http.bodies[0]?.url).toBe(`${BASE}/api/getClientDebt`);
    expect(JSON.parse(http.bodies[0]?.body ?? '{}')).toEqual({ api_key: 'K-test-key' });
    expect(deudores).toEqual([{ id: '4', nombre: 'Michel', celular: '7721346423', deuda: 1000 }]);
  });

  it('respuesta no lista => error identificable', async () => {
    await expect(
      cliente(new RecordingHttp(new JsonResponse(200, '{"id":"4"}'))).fetchClientesConAdeudo(),
    ).rejects.toThrowError(/lista/);
  });
});

describe('mapCliente (task 4.4)', () => {
  it('tolera campos ausentes sin romper', () => {
    const c = mapCliente({ id: '7', nombre: 'Sin datos' });
    expect(c.direccion).toBeNull();
    expect(c.localidad).toBeNull();
    expect(c.rfc).toBeNull();
    expect(c.servicios).toEqual([]);
    expect(c.saldoReportado).toBe(0);
  });
});
