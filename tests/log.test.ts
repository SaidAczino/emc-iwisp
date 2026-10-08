import { describe, expect, it } from 'vitest';
import { Redactor, createLogger } from '../src/log.js';

const API_KEY = 'K269899da6e7bd622aa58bc6084f1421d';
const PASSWORD = 'vhernandez14';

describe('redactor de secretos (tarea 2.4)', () => {
  it('sustituye secretos registrados por cualquier salida', () => {
    const r = new Redactor();
    r.register(API_KEY, PASSWORD);
    const out = r.redact(`falló con api_key=${API_KEY} y pass=${PASSWORD}`);
    expect(out).not.toContain(API_KEY);
    expect(out).not.toContain(PASSWORD);
    expect(out).toContain('[REDACTED]');
  });

  it('cubre cookies de sesión y pares api_key/pass por patrón, aunque no estén registrados', () => {
    const r = new Redactor();
    const out = r.redact('Cookie: PHPSESSID=abc123def; body={"api_key":"SECRETO123","pass":"SECRETO456"}');
    expect(out).not.toContain('abc123def');
    expect(out).not.toContain('SECRETO123');
    expect(out).not.toContain('SECRETO456');
  });

  it('el logger no filtra secretos ni en mensajes ni en objetos ni en errores', () => {
    const lines: string[] = [];
    const r = new Redactor();
    r.register(API_KEY, PASSWORD);
    const log = createLogger({ redactor: r, sink: (l) => lines.push(l) });

    log.error('login falló', { detalle: `token para ${API_KEY}` });
    log.warn('reintento', new Error(`401 con ${PASSWORD}`));
    log.info('cookie', `Set-Cookie: PHPSESSID=filt123; path=/`);

    const blob = lines.join('\n');
    expect(blob).not.toContain(API_KEY);
    expect(blob).not.toContain(PASSWORD);
    expect(blob).not.toContain('filt123');
    expect(blob).toContain('[REDACTED]');
  });
});
