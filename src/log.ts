/**
 * Logger con redacción obligatoria de secretos (tarea 2.4).
 *
 * Cualquier string u objeto que pase por aquí pierde: API Key, contraseña,
 * token de reCAPTCHA y cookies de sesión. Si un secreto se filtra por otra
 * vía (p. ej. un error que concatena un header), los patrones generales lo
 * tapan igual.
 */

const GENERIC_PATTERNS: Array<[RegExp, string]> = [
  [/(PHPSESSID=)[^;\s"']+/gi, '$1[REDACTED]'],
  [/((?:api[_-]?key|apikey)["'\s:=]+)[^,\s"'}]+/gi, '$1[REDACTED]'],
  [/((?:pass(?:word)?|contrasena|token)["'\s:=]+)[^,\s"'}]+/gi, '$1[REDACTED]'],
  [/(authorization["'\s:=]+bearer\s+)[^,\s"']+/gi, '$1[REDACTED]'],
];

export class Redactor {
  private readonly secrets: string[] = [];

  /** Registra un secreto concreto (valor literal) para sustituirlo en cualquier salida. */
  register(...values: Array<string | undefined | null>): void {
    for (const v of values) {
      if (v && v.length >= 4 && !this.secrets.includes(v)) this.secrets.push(v);
    }
  }

  redact(text: string): string {
    let out = text;
    for (const secret of this.secrets) {
      out = out.split(secret).join('[REDACTED]');
    }
    for (const [pattern, replacement] of GENERIC_PATTERNS) {
      out = out.replace(pattern, replacement);
    }
    return out;
  }

  /** Redacta cualquier valor serializable de forma segura. */
  redactValue<T>(value: T): T {
    if (typeof value === 'string') return this.redact(value) as unknown as T;
    if (value instanceof Error) {
      const copy = new Error(this.redact(value.message));
      copy.name = value.name;
      copy.stack = value.stack ? this.redact(value.stack) : copy.stack;
      return copy as unknown as T;
    }
    if (Array.isArray(value)) return value.map((v) => this.redactValue(v)) as unknown as T;
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.redactValue(v);
      }
      return out as unknown as T;
    }
    return value;
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...rest: unknown[]): void;
  info(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
  error(message: string, ...rest: unknown[]): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(options: { redactor: Redactor; level?: LogLevel; sink?: (line: string) => void } = { redactor: new Redactor() }): Logger {
  const { redactor, level = 'info', sink = (line: string) => process.stdout.write(line + '\n') } = options;
  const min = LEVEL_ORDER[level];

  const emit = (lvl: LogLevel, message: string, rest: unknown[]): void => {
    if (LEVEL_ORDER[lvl] < min) return;
    const extras = rest.map((r) => {
      const v = redactor.redactValue(r);
      if (typeof v === 'string') return v;
      if (v instanceof Error) return `${v.name}: ${v.message}`;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    });
    const line = `[${new Date().toISOString()}] ${lvl.toUpperCase()} ${redactor.redact(message)}`;
    sink(extras.length > 0 ? `${line} ${extras.join(' ')}` : line);
  };

  return {
    debug: (m, ...r) => emit('debug', m, r),
    info: (m, ...r) => emit('info', m, r),
    warn: (m, ...r) => emit('warn', m, r),
    error: (m, ...r) => emit('error', m, r),
  };
}
