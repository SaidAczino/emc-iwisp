import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';

describe('configuración', () => {
  it('falla con mensaje identificable si faltan credenciales', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    expect(() => loadConfig(dir)).toThrowError(/IWISP_API_KEY/);
  });

  it('lee .env y aplica defaults', () => {
    const previo = process.env.PORT;
    delete process.env.PORT;
    try {
      const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
      writeFileSync(
        join(dir, '.env'),
        ['IWISP_API_KEY=test-key', 'IWISP_WISP_ID=331', 'IWISP_USERNAME=u', 'IWISP_PASSWORD=p'].join('\n'),
      );
      const cfg = loadConfig(dir);
      expect(cfg.apiKey).toBe('test-key');
      expect(cfg.baseUrl).toBe('https://cloud.iwisp.mx:4434');
      expect(cfg.port).toBe(3000);
      expect(cfg.sessionTtlMs).toBeGreaterThan(0);
    } finally {
      if (previo !== undefined) process.env.PORT = previo;
    }
  });

  it('el puerto se puede cambiar con PORT en .env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    writeFileSync(
      join(dir, '.env'),
      ['IWISP_API_KEY=test-key', 'IWISP_WISP_ID=331', 'IWISP_USERNAME=u', 'IWISP_PASSWORD=p', 'PORT=4321'].join('\n'),
    );
    const previo = process.env.PORT;
    delete process.env.PORT;
    try {
      expect(loadConfig(dir).port).toBe(4321);
    } finally {
      if (previo !== undefined) process.env.PORT = previo;
    }
  });
});
