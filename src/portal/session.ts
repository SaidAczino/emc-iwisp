/**
 * `PortalSession` por HTTP puro (tarea 4.1) — camino elegido por el spike.
 *
 * Flujo de login (ver spike y design.md → Open Questions):
 *   POST /login (form + token reCAPTCHA v3) → 302 /sesion
 *   POST /sesion/seleccion (geocerca)      → 302 /
 *
 * Tarea 4.2: la sesión se persiste con vigencia y se renueva automáticamente
 * cuando el portal responde con redirección al login, con UN solo reintento
 * por petición.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Config } from '../config.js';
import { AuthError, PortalNoDisponibleError } from '../domain/errors.js';
import type { Logger } from '../log.js';
import type { PortalSession, Session } from '../domain/ports.js';
import { CookieJar, type CookieSnapshot } from './cookieJar.js';
import { UndiciHttpClient, type HttpClient } from './http.js';
import { fetchRecaptchaToken } from './recaptcha.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface PersistedSession {
  expiresAt: number;
  cookies: CookieSnapshot[];
}

/**
 * Decodifica HTML respetando el charset real. El portal NO declara charset
 * (`content-type: text/html`) y sirve windows-1252: decodificar como UTF-8
 * rompe los acentos ("Facturaci\u00f3n" y "Nota de D\u00e9bito" quedan mojibake).
 * Estrategia: charset expl\u00edcito > meta charset > UTF-8 v\u00e1lido > windows-1252.
 */
export function decodificarHtml(bytes: Uint8Array, contentType: string | null): string {
  const declarado = contentType?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const candidatos = [declarado, 'utf-8', 'windows-1252'].filter((c): c is string => Boolean(c));
  for (const charset of candidatos) {
    try {
      return new TextDecoder(charset, { fatal: charset !== 'windows-1252' }).decode(bytes);
    } catch {
      // Charset declarado no soportado o bytes que no lo validan: se prueba el siguiente.
    }
  }
  return new TextDecoder('windows-1252').decode(bytes);
}

function looksLikeLoginBounce(status: number, location: string | null, body: string): boolean {
  if (status >= 300 && status < 400) {
    const loc = location ?? '';
    if (/\/login|\/sesion|\/redirect\//.test(loc)) return true;
  }
  return body.includes('window.location="/login"');
}

function extraerMensajeDeLogin(html: string): string | null {
  return html.match(/iwisp_message_bounce\("([^"]+)",\s*0\)/)?.[1] ?? null;
}

export interface PortalSessionOptions {
  config: Config;
  logger: Logger;
  http?: HttpClient;
  sessionFile?: string;
  now?: () => number;
  /** Inyectable para tests: por defecto, el flujo HTTP real de reCAPTCHA v3. */
  recaptcha?: () => Promise<string>;
}

export class HttpPortalSession implements PortalSession {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly http: HttpClient;
  private readonly jar = new CookieJar();
  private readonly sessionFile: string;
  private readonly now: () => number;
  private readonly recaptcha: () => Promise<string>;
  private expiresAt = 0;
  private pendingLogin: Promise<void> | null = null;

  constructor(options: PortalSessionOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.http = options.http ?? new UndiciHttpClient();
    this.sessionFile = options.sessionFile ?? resolve(process.cwd(), 'portal.cookies.json');
    this.now = options.now ?? Date.now;
    this.recaptcha = options.recaptcha ?? (() => fetchRecaptchaToken(this.config.baseUrl.replace(/\/$/, '')));
    this.load();
  }

  /** Tarea 4.1/4.2: garantiza una sesión vigente, reutilizándola si aún vale. */
  async ensure(): Promise<Session> {
    if (!this.jar.isEmpty() && this.now() < this.expiresAt) {
      return { cookieHeader: this.jar.header(this.now()), expiresAt: this.expiresAt };
    }
    await this.renew();
    return { cookieHeader: this.jar.header(this.now()), expiresAt: this.expiresAt };
  }

  async fetchPage(path: string): Promise<string> {
    return this.withRenewal<string>(path, async (url) => {
      const res = await this.http.request(url, { headers: this.headers() });
      const body = decodificarHtml(await res.bytes(), res.getHeader('content-type'));
      if (looksLikeLoginBounce(res.status, res.getHeader('location'), body)) {
        return { bounced: true };
      }
      if (res.status !== 200) {
        throw new PortalNoDisponibleError(`El portal respondió ${res.status} para ${path}`);
      }
      return { bounced: false, value: body };
    });
  }

  async fetchFile(path: string): Promise<{ contentType: string; bytes: Uint8Array }> {
    return this.withRenewal<{ contentType: string; bytes: Uint8Array }>(path, async (url) => {
      const res = await this.http.request(url, { headers: this.headers() });
      const contentType = res.getHeader('content-type') ?? '';
      const bytes = await res.bytes();
      if (res.status >= 300 && res.status < 400) {
        return { bounced: true };
      }
      if (contentType.includes('text/html')) {
        const head = new TextDecoder('latin1').decode(bytes.subarray(0, 512));
        if (looksLikeLoginBounce(res.status, null, head)) return { bounced: true };
      }
      if (res.status !== 200) {
        throw new PortalNoDisponibleError(`El portal respondió ${res.status} para ${path}`);
      }
      return { bounced: false, value: { contentType, bytes } };
    });
  }

  /** Un solo reintento por petición: si el portal rebota al login, se renueva la sesión y se reintenta. */
  private async withRenewal<T>(path: string, run: (url: string) => Promise<{ bounced: boolean; value?: T }>): Promise<T> {
    await this.ensure();
    const url = this.config.baseUrl + path;
    let attempt = await run(url);
    if (attempt.bounced) {
      this.logger.warn(`Sesión caducada detectada en ${path}; se renueva (único reintento)`);
      await this.renew();
      attempt = await run(url);
      if (attempt.bounced) throw new AuthError(`El portal sigue exigiendo login tras renovar la sesión (${path})`);
    }
    if (attempt.value === undefined) {
      throw new PortalNoDisponibleError(`Respuesta vacía de ${path}`);
    }
    return attempt.value;
  }

  private headers(): Record<string, string> {
    const cookie = this.jar.header(this.now());
    return { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) };
  }

  private async renew(): Promise<void> {
    if (!this.pendingLogin) {
      this.pendingLogin = this.login().finally(() => {
        this.pendingLogin = null;
      });
    }
    await this.pendingLogin;
  }

  private async login(): Promise<void> {
    this.jar.clear();
    this.logger.info('Estableciendo sesión contra el portal I-WISP');

    const origin = this.config.baseUrl.replace(/\/$/, '');
    const token = await this.recaptcha();

    const loginBody = new URLSearchParams({
      id_empresa: this.config.wispId,
      user: this.config.username,
      pass: this.config.password,
      token,
      iniciar_a: 'Iniciar',
    });
    const loginRes = await this.http.request(`${origin}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: loginBody.toString(),
    });
    this.jar.absorb(loginRes.getSetCookies(), this.now());

    if (loginRes.status !== 302) {
      const html = await loginRes.text();
      const motivo = extraerMensajeDeLogin(html) ?? 'el portal no confirmó la sesión';
      throw new AuthError(`Login rechazado: ${motivo}`);
    }

    // Paso intermedio obligatorio del portal: GET /sesion (sin él, la
    // selección de geocerca responde 302 /logout y la sesión queda inválida).
    const sesionRes = await this.http.request(`${origin}/sesion`, { headers: this.headers() });
    this.jar.absorb(sesionRes.getSetCookies(), this.now());

    // Segundo paso obligatorio del portal: selección de geocerca.
    const selBody = new URLSearchParams({ seleccion_id: 'ALL_GEO', seleccion_recordar: 'on' });
    const selRes = await this.http.request(`${origin}/sesion/seleccion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        Cookie: this.jar.header(this.now()),
      },
      body: selBody.toString(),
    });
    this.jar.absorb(selRes.getSetCookies(), this.now());
    if (selRes.status !== 302 && selRes.status !== 200) {
      throw new AuthError(`El portal rechazó la selección de sesión (${selRes.status})`);
    }

    // Verificación: una página autenticada no debe rebotar al login.
    const home = await this.http.request(`${origin}/`, { headers: this.headers() });
    const homeBody = await home.text();
    if (looksLikeLoginBounce(home.status, home.getHeader('location'), homeBody)) {
      throw new AuthError('El portal no aceptó la sesión aunque el login respondió 302');
    }

    this.expiresAt = this.now() + this.config.sessionTtlMs;
    this.save();
    this.logger.info('Sesión del portal establecida y persistida');
  }

  private load(): void {
    try {
      if (!existsSync(this.sessionFile)) return;
      const raw = JSON.parse(readFileSync(this.sessionFile, 'utf8')) as PersistedSession;
      if (typeof raw.expiresAt !== 'number' || !Array.isArray(raw.cookies)) return;
      if (raw.expiresAt <= this.now()) return;
      this.jar.restore(raw.cookies);
      this.expiresAt = raw.expiresAt;
      if (!this.jar.isEmpty()) this.logger.info('Sesión del portal reutilizada desde disco');
    } catch {
      // Archivo corrupto o ilegible: se ignora y se vuelve a loguear.
      this.jar.clear();
      this.expiresAt = 0;
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.sessionFile), { recursive: true });
      const payload: PersistedSession = { expiresAt: this.expiresAt, cookies: this.jar.snapshot(this.now()) };
      writeFileSync(this.sessionFile, JSON.stringify(payload, null, 2), { encoding: 'utf8' });
    } catch (err) {
      this.logger.warn('No se pudo persistir la sesión del portal', err);
    }
  }
}
