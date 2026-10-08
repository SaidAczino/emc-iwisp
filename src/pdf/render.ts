/**
 * Render del estado de cuenta a PDF (tasks 7.5, 7.8, 7.9 / D1).
 * La paginación la resuelve el motor de impresión de Chrome: `thead` con
 * `display: table-header-group` repite el encabezado en cada página y las
 * filas no se cortan (`break-inside: avoid`).
 */
import puppeteer, { type Browser } from 'puppeteer';
import { SinMovimientosError } from '../domain/errors.js';
import type { ClienteIwisP, ResultadoEstadoCuenta } from '../domain/types.js';

function slug(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'cliente'
  );
}

/** Task 7.8 — nombre identificable y sin colisiones entre clientes (lleva el id). */
export function nombreArchivoEstadoCuenta(cliente: Pick<ClienteIwisP, 'id' | 'nombre'>, fecha = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const dia = `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}`;
  return `estado-cuenta_${cliente.id}_${slug(cliente.nombre)}_${dia}.pdf`;
}

export class PdfRenderer {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
    }
    return this.browser;
  }

  async render(html: string): Promise<Uint8Array> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      return pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

/** Task 7.9 — sin movimientos no se genera documento (defensa en profundidad). */
export function exigirMovimientos(resultado: ResultadoEstadoCuenta): void {
  if (resultado.movimientos.length === 0) throw new SinMovimientosError(resultado.cliente.id);
}
