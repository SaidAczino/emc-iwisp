/**
 * Dobles de prueba (task 3.5): nada de esta carpeta toca la red.
 */
import type { ClientSource, DebtSource, MovementSource, PortalSession, Session } from '../src/domain/ports.js';
import type { ClienteDeudor, ClienteIwisP, RawMovimiento } from '../src/domain/types.js';

export class FakePortalSession implements PortalSession {
  readonly calls: string[] = [];
  private session: Session = { cookieHeader: 'PHPSESSID=fake', expiresAt: Date.now() + 60_000 };

  constructor(
    private readonly pages: Record<string, string> = {},
    private readonly files: Record<string, { contentType: string; bytes: Uint8Array }> = {},
  ) {}

  async ensure(): Promise<Session> {
    this.calls.push('ensure');
    return this.session;
  }

  async fetchPage(path: string): Promise<string> {
    this.calls.push(`fetchPage:${path}`);
    const page = this.pages[path];
    if (page === undefined) throw new Error(`página no preparada en el doble: ${path}`);
    return page;
  }

  async fetchFile(path: string): Promise<{ contentType: string; bytes: Uint8Array }> {
    this.calls.push(`fetchFile:${path}`);
    const file = this.files[path];
    if (file === undefined) throw new Error(`archivo no preparado en el doble: ${path}`);
    return file;
  }
}

export class FakeMovementSource implements MovementSource {
  readonly calls: string[] = [];
  constructor(private readonly rows: RawMovimiento[] | Error) {}

  async fetchMovimientos(idCliente: string): Promise<RawMovimiento[]> {
    this.calls.push(idCliente);
    if (this.rows instanceof Error) throw this.rows;
    return this.rows;
  }
}

export class FakeClientSource implements ClientSource {
  readonly calls: string[] = [];
  constructor(private readonly cliente: ClienteIwisP | Error) {}

  async fetchCliente(idCliente: string): Promise<ClienteIwisP> {
    this.calls.push(idCliente);
    if (this.cliente instanceof Error) throw this.cliente;
    return this.cliente;
  }
}

export class FakeDebtSource implements DebtSource {
  readonly calls: string[] = [];
  constructor(private readonly clientes: ClienteDeudor[] | Error) {}

  async fetchClientesConAdeudo(): Promise<ClienteDeudor[]> {
    this.calls.push('fetchClientesConAdeudo');
    if (this.clientes instanceof Error) throw this.clientes;
    return this.clientes;
  }
}

export function clienteFake(overrides: Partial<ClienteIwisP> = {}): ClienteIwisP {
  return {
    id: '453',
    nombre: 'Marnay Sarmiento',
    direccion: 'Hulum 22',
    localidad: 'Paseos del Lago 2, Zumpango, Edo. de Méx.',
    rfc: '',
    tipoServicio: 'Con plan',
    celular: '5624150665',
    servicios: [{ tipo: 'W', plan: '10', nombre: 'WI-Plan300_10M_Zumpango', costo: 300 }],
    saldoReportado: 600,
    ...overrides,
  };
}

export function filaFake(overrides: Partial<RawMovimiento> = {}): RawMovimiento {
  return {
    tipo: 'Factura',
    numero: '13355',
    cobranza: '-',
    detalle: 'Factura Mensual Octubre',
    importe: '$ 300.00',
    fecha: '01/10/2026 07:49:55',
    balance: '$ 900.00',
    idMovimiento: '/factura/ver/FX/13355',
    ...overrides,
  };
}
