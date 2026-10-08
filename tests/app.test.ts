import { afterAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AuthError, ClienteNoEncontradoError } from '../src/domain/errors.js';
import type { DebtSource } from '../src/domain/ports.js';
import { Redactor, createLogger } from '../src/log.js';
import type { GeneradorEstadoCuenta, DocumentoEstadoCuenta } from '../src/service/generar.js';
import { buildApp, estadoHttpDeError } from '../src/ui/app.js';
import { FakePortalSession, clienteFake } from './fakes.js';

function logger() {
  return createLogger({ redactor: new Redactor(), sink: () => {} });
}

function documentoFake(): DocumentoEstadoCuenta {
  const cliente = clienteFake();
  return {
    resultado: {
      cliente,
      movimientos: [],
      totales: { totalFacturado: 300, totalCobrado: 0, saldoPendiente: 300 },
      verificacion: { calculado: 300, reportado: 600, coincide: false },
      advertencias: [],
    },
    html: '<html></html>',
    pdf: new TextEncoder().encode('%PDF-1.7 fake'),
    filename: 'estado-cuenta_453_marnay-sarmiento_20261007.pdf',
  };
}

async function conServidor(deps: Parameters<typeof buildApp>[0]): Promise<{ url: string; cerrar: () => Promise<void> }> {
  const app = buildApp(deps);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    cerrar: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('listado de clientes con adeudo (tasks 8.1, 8.2, 8.6)', () => {
  it('garantiza la sesión ANTES de pedir el listado (task 8.6)', async () => {
    const session = new FakePortalSession();
    const debtSource: DebtSource = {
      async fetchClientesConAdeudo() {
        expect(session.calls).toContain('ensure');
        return [{ id: '4', nombre: 'Michel', celular: '7721346423', deuda: 1000 }];
      },
    };
    const servidor = await conServidor({
      session,
      debtSource,
      generador: {} as GeneradorEstadoCuenta,
      logger: logger(),
    });
    try {
      const res = await fetch(servidor.url);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(session.calls[0]).toBe('ensure');
      expect(html).toContain('Michel');
    } finally {
      await servidor.cerrar();
    }
  });

  it('tabla con identificador, nombre, celular y saldo (task 8.2)', async () => {
    const servidor = await conServidor({
      session: new FakePortalSession(),
      debtSource: {
        async fetchClientesConAdeudo() {
          return [{ id: '4', nombre: 'Michel Callejas Tolentino', celular: '7721346423', deuda: 1000 }];
        },
      },
      generador: {} as GeneradorEstadoCuenta,
      logger: logger(),
    });
    try {
      const html = await (await fetch(servidor.url)).text();
      expect(html).toContain('<th>ID</th>');
      expect(html).toContain('<th>Nombre</th>');
      expect(html).toContain('<th>Celular</th>');
      expect(html).toContain('Saldo adeudado');
      expect(html).toContain('7721346423');
      expect(html).toContain('$1000.00');
      expect(html).toContain('href="/clientes/4/estado-cuenta.pdf"'); // botón por fila (task 8.4)
    } finally {
      await servidor.cerrar();
    }
  });

  it('estado vacío cuando no hay deudores, sin error (task 8.3)', async () => {
    const servidor = await conServidor({
      session: new FakePortalSession(),
      debtSource: { async fetchClientesConAdeudo() { return []; } },
      generador: {} as GeneradorEstadoCuenta,
      logger: logger(),
    });
    try {
      const res = await fetch(servidor.url);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toMatch(/No hay clientes con adeudo/);
      expect(html).not.toMatch(/class="aviso"/);
    } finally {
      await servidor.cerrar();
    }
  });

  it('fallo del portal: causa identificable para el operador (task 8.5)', async () => {
    const servidor = await conServidor({
      session: new FakePortalSession(),
      debtSource: {
        async fetchClientesConAdeudo() {
          throw new AuthError('La API Key fue rechazada por /api/getClientDebt (401)');
        },
      },
      generador: {} as GeneradorEstadoCuenta,
      logger: logger(),
    });
    try {
      const res = await fetch(servidor.url);
      const html = await res.text();
      expect(res.status).toBe(401);
      expect(html).toContain('La API Key fue rechazada');
    } finally {
      await servidor.cerrar();
    }
  });
});

describe('descarga del estado de cuenta (tasks 8.4 y 8.5)', () => {
  it('entrega el PDF completo con nombre identificable', async () => {
    const servidor = await conServidor({
      session: new FakePortalSession(),
      debtSource: { async fetchClientesConAdeudo() { return []; } },
      generador: {
        async generar(id: string) {
          expect(id).toBe('453');
          return documentoFake();
        },
      } as unknown as GeneradorEstadoCuenta,
      logger: logger(),
    });
    try {
      const res = await fetch(`${servidor.url}/clientes/453/estado-cuenta.pdf`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('estado-cuenta_453_marnay-sarmiento_20261007.pdf');
      expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('%PDF-1.7');
    } finally {
      await servidor.cerrar();
    }
  });

  it('fallo durante la generación: informa la causa y NO entrega un archivo parcial (task 8.5)', async () => {
    const servidor = await conServidor({
      session: new FakePortalSession(),
      debtSource: { async fetchClientesConAdeudo() { return []; } },
      generador: {
        async generar() {
          throw new ClienteNoEncontradoError('999999');
        },
      } as unknown as GeneradorEstadoCuenta,
      logger: logger(),
    });
    try {
      const res = await fetch(`${servidor.url}/clientes/999999/estado-cuenta.pdf`);
      const texto = await res.text();
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).not.toContain('application/pdf');
      expect(texto).toContain('no existe en I-WISP');
      expect(texto).toContain('No se entregó ningún archivo');
    } finally {
      await servidor.cerrar();
    }
  });
});

describe('mapeo de errores HTTP (task 8.5)', () => {
  it('cada error tiene causa y estado identificables', () => {
    expect(estadoHttpDeError(new ClienteNoEncontradoError('1'))).toEqual({ status: 404, causa: 'El cliente 1 no existe en I-WISP' });
    expect(estadoHttpDeError(new AuthError('login rechazado')).status).toBe(401);
    expect(estadoHttpDeError(new Error('x')).status).toBe(500);
  });
});

afterAll(() => {
  // Los servidores se cierran en cada test.
});
