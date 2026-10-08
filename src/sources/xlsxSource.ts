/**
 * Fuente XLSX de movimientos (task 5.4) sobre `/clientes/movimientos-xlsx/{id}`.
 * Es la fuente PRIMARIA del D2; la degradación al HTML vive en `CompositeMovementSource`.
 */
import ExcelJS from 'exceljs';
import { ExtraccionError } from '../domain/errors.js';
import type { MovementSource, PortalSession } from '../domain/ports.js';
import type { RawMovimiento } from '../domain/types.js';
import type { Logger } from '../log.js';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join('');
    }
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value && value.result !== undefined && value.result !== null) return String(value.result);
    if ('hyperlink' in value && typeof value.hyperlink === 'string') return value.hyperlink;
  }
  return '';
}

function esCabecera(valores: string[]): boolean {
  const norm = valores.map((v) => (v ?? '').toLowerCase());
  return norm.includes('tipo') && norm.includes('importe');
}

/**
 * Ubica la celda `Tipo` del encabezado: los datos NO siempre empiezan en la
 * columna 1 (en el portal real arrancan en la 3) y los índices previos son
 * huecos del array de ExcelJS, a los que `findIndex` sí invoca el callback.
 */
function localizarEncabezado(valores: string[]): number {
  return valores.findIndex((v) => (v ?? '').toLowerCase() === 'tipo');
}

export class XlsxMovementSource implements MovementSource {
  constructor(
    private readonly session: PortalSession,
    private readonly logger?: Logger,
  ) {}

  async fetchMovimientos(idCliente: string): Promise<RawMovimiento[]> {
    const path = `/clientes/movimientos-xlsx/${encodeURIComponent(idCliente)}`;
    const { contentType, bytes } = await this.session.fetchFile(path);

    if (bytes.length < 4 || !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
      throw new ExtraccionError(
        `La exportación XLSX de ${path} no es un archivo válido (content-type: ${contentType})`,
      );
    }

    const workbook = new ExcelJS.Workbook();
    try {
      // exceljs declara `Buffer` con tipos de Node anteriores: se adapta la firma de carga.
      const load = workbook.xlsx.load.bind(workbook.xlsx) as (data: unknown) => Promise<ExcelJS.Workbook>;
      await load(Buffer.from(bytes));
    } catch (err) {
      throw new ExtraccionError(`No se pudo leer el XLSX de ${path}`, { cause: err });
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ExtraccionError(`El XLSX de ${path} no tiene hojas`);

    let headerIndex = 0;
    let header: string[] = [];
    let colInicio = 1;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const valores = (Array.isArray(row.values) ? (row.values as ExcelJS.CellValue[]) : []).map((v) =>
        cellText(v),
      );
      if (esCabecera(valores)) {
        headerIndex = rowNumber;
        header = valores;
        colInicio = Math.max(localizarEncabezado(valores), 1);
      }
    });
    if (headerIndex === 0) {
      throw new ExtraccionError(`El XLSX de ${path} no contiene la fila de encabezado esperada`);
    }
    this.logger?.debug(`XLSX: encabezado "${header.join(' | ')}" en la fila ${headerIndex}`);

    const out: RawMovimiento[] = [];
    for (let r = headerIndex + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const valores = row.values as ExcelJS.CellValue[];
      // Las columnas de datos siguen a la celda `Tipo` del encabezado
      // (en el portal real arrancan en la columna 3; 1–2 quedan vacías).
      const celdas = [0, 1, 2, 3, 4, 5, 6].map((i) => cellText(valores[colInicio + i]));
      if (celdas.every((v) => v === '')) continue;
      out.push({
        tipo: celdas[0] ?? '',
        numero: celdas[1] ?? '',
        cobranza: celdas[2] ?? '',
        detalle: celdas[3] ?? '',
        importe: celdas[4] ?? '',
        fecha: celdas[5] ?? '',
        balance: celdas[6] ?? '',
        // El XLSX no trae `onclick`: no hay identificador de fila que capturar.
        idMovimiento: undefined,
      });
    }

    // Tarea 5.11 aplicada a AMBAS fuentes (D2): cero filas => error explícito.
    if (out.length === 0) {
      throw new ExtraccionError(`La exportación XLSX de ${path} no contiene movimientos`);
    }

    this.logger?.debug(`XLSX: ${out.length} movimientos extraídos para el cliente ${idCliente}`);
    return out;
  }
}
