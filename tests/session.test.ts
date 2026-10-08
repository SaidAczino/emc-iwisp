import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../src/config.js';
import { AuthError } from '../src/domain/errors.js';
import { Redactor, createLogger } from '../src/log.js';
import type { HttpClient, HttpRequestInit, HttpResponse } from '../src/portal/http.js';
import { HttpPortalSession, decodificarHtml } from '../src/portal/session.js';

const BASE = 'https://portal.test';
const LOGIN_REDIRECT_BODY = '<script>\n  window.location="/login";\n</script>';
const DASHBOARD_BODY = '<html><body>Dashboard I-WISP</body></html>';

function config(ttlMs = 60_000): Config {
  return {
    apiKey: 'K-test-key',
    wispId: '331',
    username: 'vhernandez',
    password: 'secreta',
    baseUrl: BASE,
    outputDir: 'output',
    sessionTtlMs: ttlMs,
    port: 3000,
    logLevel: 'info',
  };
}

function logger(): { log: ReturnType<typeof createLogger>; lineas: string[] } {
  const lineas: string[] = [];
  const redactor = new Redactor();
  redactor.register('secreta', 'K-test-key');
  return { log: createLogger({ redactor, sink: (l) => lineas.push(l) }), lineas };
}

class FakeResponse implements HttpResponse {
  constructor(
    private readonly status_: number,
    private readonly headers: Record<string, string> = {},
    private readonly body = '',
    private readonly setCookies: string[] = [],
  ) {}

  get status(): number {
    return this.status_;
  }

  getHeader(name: string): string | null {
    return this.headers[name.toLowerCase()] ?? null;
  }

  getSetCookies(): string[] {
    return this.setCookies;
  }

  async text(): Promise<string> {
    return this.body;
  }

  async bytes(): Promise<Uint8Array> {
    return new TextEncoder().encode(this.body);
  }
}

/** HTTP guionizado: registra cada llamada y sigue un guion por URL. */
class ScriptedHttp implements HttpClient {
  readonly calls: Array<{ url: string; method: string }> = [];
  loginCount = 0;
  pageCount = 0;
  /** Respuesta para la página de movimientos; la primera puede rebotar al login. */
  pageResponses: Array<() => HttpResponse>;

  constructor(pageResponses: Array<() => HttpResponse>) {
    this.pageResponses = pageResponses;
  }

  async request(url: string, init: HttpRequestInit = {}): Promise<HttpResponse> {
    const method = init.method ?? 'GET';
    this.calls.push({ url, method });

    if (url === `${BASE}/login`) {
      this.loginCount += 1;
      return new FakeResponse(
        302,
        { location: '/sesion' },
        '',
        [`PHPSESSID=cookie-${this.loginCount}; path=/`],
      );
    }
    if (url === `${BASE}/sesion/seleccion`) return new FakeResponse(302, { location: '/' });
    if (url === `${BASE}/`) return new FakeResponse(200, {}, DASHBOARD_BODY);
    if (url.startsWith(`${BASE}/clientes/`)) {
      const factory = this.pageResponses[Math.min(this.pageCount, this.pageResponses.length - 1)];
      this.pageCount += 1;
      return factory ? factory() : new FakeResponse(200, {}, 'ok');
    }
    return new FakeResponse(404, {}, 'no encontrado');
  }
}

function bounce(): HttpResponse {
  return new FakeResponse(200, {}, LOGIN_REDIRECT_BODY);
}

function contenido(): HttpResponse {
  return new FakeResponse(200, {}, '<html><table id="tabla_cta_cte_reducida"></table></html>');
}

function sesion(http: HttpClient, file: string, opts: { recaptcha?: () => Promise<string>; now?: () => number } = {}) {
  const { log } = logger();
  return new HttpPortalSession({
    config: config(),
    logger: log,
    http,
    sessionFile: file,
    recaptcha: opts.recaptcha ?? (async () => 'token-de-prueba'),
    now: opts.now,
  });
}

describe('decodificación del HTML del portal', () => {
  it('decodifica windows-1252 cuando el portal no declara charset (acentos)', () => {
    // "Facturación" y "Nota de Débito" en windows-1252, como los sirve el portal.
    const latin1 = new Uint8Array([0x46, 0x61, 0x63, 0x74, 0x75, 0x72, 0x61, 0x63, 0x69, 0xf3, 0x6e, 0x20, 0x44, 0xe9, 0x62, 0x69, 0x74, 0x6f]);
    expect(decodificarHtml(latin1, 'text/html')).toBe('Facturación Débito');
    expect(decodificarHtml(latin1, null)).toBe('Facturación Débito');
  });

  it('decodifica UTF-8 cuando los bytes lo son', () => {
    const utf8 = new TextEncoder().encode('Facturación y cobranza — año');
    expect(decodificarHtml(utf8, null)).toBe('Facturación y cobranza — año');
  });

  it('respeta el charset declarado en el content-type', () => {
    const latin1 = new Uint8Array([0xf3]);
    expect(decodificarHtml(latin1, 'text/html; charset=windows-1252')).toBe('ó');
  });
});

describe('PortalSession por HTTP puro (tasks 4.1 y 4.2)', () => {
  it('hace login, salta el segundo paso (selección) y reutiliza la sesión', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sess-')), 'portal.cookies.json');
    const http = new ScriptedHttp([contenido]);
    const session = sesion(http, file);

    const cookie = await session.ensure();
    expect(cookie.cookieHeader).toContain('PHPSESSID=cookie-1');
    expect(http.loginCount).toBe(1);
    expect(http.calls.some((c) => c.url === `${BASE}/login` && c.method === 'POST')).toBe(true);
    expect(http.calls.some((c) => c.url === `${BASE}/sesion/seleccion` && c.method === 'POST')).toBe(true);

    const html = await session.fetchPage('/clientes/facturas_cobranza/453');
    expect(html).toContain('tabla_cta_cte_reducida');
    // La sesión ya establecida no vuelve a loguear.
    expect(http.loginCount).toBe(1);
  });

  it('persiste la sesión con vigencia en disco y la reutiliza en otra instancia', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sess-')), 'portal.cookies.json');
    const primera = sesion(new ScriptedHttp([contenido]), file);
    await primera.ensure();
    expect(existsSync(file)).toBe(true);

    const persistida = JSON.parse(readFileSync(file, 'utf8')) as { expiresAt: number; cookies: unknown[] };
    expect(persistida.expiresAt).toBeGreaterThan(Date.now());
    expect(persistida.cookies).toHaveLength(1);

    const httpSegunda = new ScriptedHttp([contenido]);
    const segunda = sesion(httpSegunda, file);
    await segunda.ensure();
    // Sin login: se sirve de la sesión en disco.
    expect(httpSegunda.loginCount).toBe(0);
    expect(httpSegunda.calls.some((c) => c.url === `${BASE}/login`)).toBe(false);
  });

  it('renueva la sesión al detectar el redirect al login y reintenta UNA sola vez (task 4.2)', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sess-')), 'portal.cookies.json');
    const http = new ScriptedHttp([bounce, contenido]);
    const session = sesion(http, file);
    await session.ensure();
    expect(http.loginCount).toBe(1);

    const html = await session.fetchPage('/clientes/facturas_cobranza/453');
    expect(html).toContain('tabla_cta_cte_reducida');
    expect(http.loginCount).toBe(2); // renovación
    expect(http.pageCount).toBe(2); // reintento único
  });

  it('si tras renovar sigue rebotando, falla con AuthError (no devuelve HTML de login)', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sess-')), 'portal.cookies.json');
    const http = new ScriptedHttp([bounce, bounce]);
    const session = sesion(http, file);

    await expect(session.fetchPage('/clientes/facturas_cobranza/453')).rejects.toBeInstanceOf(AuthError);
    expect(http.loginCount).toBe(2);
    expect(http.pageCount).toBe(2); // sin reintentos infinitos
  });

  it('login rechazado => AuthError con el motivo del portal', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sess-')), 'portal.cookies.json');
    const http = new ScriptedHttp([contenido]);
    const httpRechazado: HttpClient = {
      async request(url, init) {
        if (url === `${BASE}/login`) {
          return new FakeResponse(200, {}, '<script>iwisp_message_bounce("Error, código incorrecto",0);</script>');
        }
        return http.request(url, init);
      },
    };
    const session = sesion(httpRechazado, file);

    await expect(session.ensure()).rejects.toBeInstanceOf(AuthError);
    await expect(session.ensure()).rejects.toThrowError(/código incorrecto/);
  });

  it('la sesión caducada por vigencia dispara un nuevo login', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sess-')), 'portal.cookies.json');
    let ahora = Date.now();
    const http = new ScriptedHttp([contenido]);
    const session = sesion(http, file, { now: () => ahora });

    await session.ensure();
    expect(http.loginCount).toBe(1);

    ahora += 61_000; // supera sessionTtlMs = 60_000
    await session.ensure();
    expect(http.loginCount).toBe(2);
  });

  it('los logs nunca filtran la contraseña ni la cookie', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sess-')), 'portal.cookies.json');
    const { log, lineas } = logger();
    const http = new ScriptedHttp([contenido]);
    const session = new HttpPortalSession({
      config: config(),
      logger: log,
      http,
      sessionFile: file,
      recaptcha: async () => 'token-de-prueba',
    });
    await session.ensure();
    const blob = lineas.join('\n');
    expect(blob).not.toContain('secreta');
    expect(blob).not.toContain('cookie-1');
  });
});
