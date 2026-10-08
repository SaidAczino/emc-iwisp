import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Config {
  apiKey: string;
  wispId: string;
  username: string;
  password: string;
  baseUrl: string;
  outputDir: string;
  /** Puerto del servidor UI (variable `PORT`, por defecto 3000). */
  port: number;
  /** Nivel de log (variable `LOG_LEVEL`, por defecto `info`). */
  logLevel: LogLevel;
  /** Vigencia asumida de la sesión del portal (cookie PHPSESSID observada ≥ 10 min). */
  sessionTtlMs: number;
}

/** Lee un archivo .env (si existe) sin pisar las variables ya presentes en process.env. */
function readDotEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m?.[1] !== undefined) out[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
  return out;
}

export function loadConfig(rootDir = process.cwd()): Config {
  const fileEnv = readDotEnv(resolve(rootDir, '.env'));
  const get = (key: string): string => process.env[key] ?? fileEnv[key] ?? '';

  const missing = ['IWISP_API_KEY', 'IWISP_WISP_ID', 'IWISP_USERNAME', 'IWISP_PASSWORD'].filter((k) => !get(k));
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')} (copia .env.example a .env)`);
  }

  return {
    apiKey: get('IWISP_API_KEY'),
    wispId: get('IWISP_WISP_ID'),
    username: get('IWISP_USERNAME'),
    password: get('IWISP_PASSWORD'),
    baseUrl: get('IWISP_BASE_URL') || 'https://cloud.iwisp.mx:4434',
    outputDir: get('IWISP_OUTPUT_DIR') || 'output',
    port: Number(get('PORT')) || 3000,
    logLevel: normalizarLogLevel(get('LOG_LEVEL')),
    sessionTtlMs: Number(get('IWISP_SESSION_TTL_MS')) || 8 * 60 * 1000,
  };
}

function normalizarLogLevel(valor: string): LogLevel {
  const v = valor.trim().toLowerCase();
  return v === 'debug' || v === 'warn' || v === 'error' ? v : 'info';
}
