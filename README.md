# emc-iwisp — Estado de cuenta (EMC × I-WISP)

Aplicación interna **Node.js + TypeScript** que genera el **estado de cuenta en PDF** de
cada cliente del portal I-WISP (`cloud.iwisp.mx:4434`): histórico completo de facturas y
cobranzas, totales y **doble saldo** (`Saldo histórico calculado` vs `Saldo según I-WISP`).

Documento de cortesía: **sin validez fiscal** (no incluye UUID ni sello del SAT).

```
npm install
cp .env.example .env    # completar credenciales
npm run dev             # → http://localhost:3000
```

---

## 1. Requisitos

- **Node.js ≥ 20** (ESM, `TextDecoder` con windows-1252, `fetch` de undici).
- Credenciales del portal I-WISP: *wisp id*, usuario, contraseña y **API Key**.
- **Chrome/Chromium** para renderizar el PDF: lo descarga `puppeteer` durante
  `npm install` (≈ 150 MB) en `node_modules/puppeteer/`.

## 2. Instalación

```bash
git clone <repo> emc-iwisp
cd emc-iwisp
npm install             # instala dependencias + Chrome de puppeteer
cp .env.example .env    # y rellenar las credenciales
```

### Configuración (`.env`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `IWISP_API_KEY` | sí | API Key de I-WISP (la usan `POST /api/getClient` y `POST /api/getClientDebt`) |
| `IWISP_WISP_ID` | sí | Identificador de la empresa (p. ej. `331`) |
| `IWISP_USERNAME` | sí | Usuario del portal web |
| `IWISP_PASSWORD` | sí | Contraseña del portal web |
| `IWISP_BASE_URL` | no | Por defecto `https://cloud.iwisp.mx:4434` |
| `IWISP_OUTPUT_DIR` | no | Carpeta de salida de PDFs, por defecto `output/` |
| `IWISP_SESSION_TTL_MS` | no | Vigencia asumida de la sesión, por defecto `480000` (8 min) |
| `PORT` | no | Puerto del servidor UI, por defecto `3000` |
| `LOG_LEVEL` | no | `debug` \| `info` (defecto) \| `warn` \| `error` |

> `.env` está en `.gitignore` y **nunca** se sube al repositorio. El logger redacta API
> Key, contraseña y cookies en cualquier salida (logs, errores, trazas).

## 3. Iniciar el servidor

### Desarrollo (recarga automática)

```bash
npm run dev        # tsx watch sobre src/ui/server.ts
```

### Producción

```bash
npm run build      # compila src/ → dist/
npm run start      # node dist/ui/server.js
```

En ambos casos verás en consola:

```
… INFO Sesión del portal establecida y persistida
… INFO Estado de cuenta EMC escuchando en http://localhost:3000
```

Abrí `http://localhost:3000` (o `PORT=4000 npm run dev` para cambiar el puerto).

### Endpoints

| Método y ruta | Qué hace |
|---|---|
| `GET /` | Tabla de **clientes con adeudo** (ID, nombre, celular, saldo) con botón *Descargar PDF* por fila |
| `GET /clientes/:id/estado-cuenta.pdf` | Genera y descarga el PDF de ese cliente (`Content-Disposition: attachment`) |

```bash
# comprobación rápida por terminal
curl -s http://localhost:3000/ | grep -c estado-cuenta.pdf   # nº de botones de descarga
curl -sO -J http://localhost:3000/clientes/453/estado-cuenta.pdf
```

Los PDFs generados quedan en `output/` con nombre
`estado-cuenta_{id}_{nombre}_{yyyymmdd}.pdf` (identifica al cliente y evita colisiones).

### Contenido del PDF

1. Encabezado EMC + marca **“Documento de cortesía — sin validez fiscal”**.
2. Datos del cliente: nombre, domicilio, localidad, RFC (o *no disponible*) y servicios con plan y costo.
3. Tabla de movimientos (tipo, número, referencia, detalle, importe, fecha) con
   distinción visual factura/cobranza y **encabezado repetido en cada página**.
4. Pie con `Total facturado`, `Total cobrado` y `Saldo pendiente`.
5. Doble saldo etiquetado: `Saldo histórico calculado` y `Saldo según I-WISP`, con nota
   de coincidencia o discrepancia. **Nunca** se entrega un PDF parcial.

## 4. Validación por lote (terminal)

```bash
npm run validar                 # 5 clientes con HTML verificable + el historial más extenso
npm run validar -- 453 7        # clientes puntuales
npm run validar -- --sin-scan   # sin escanear deudores para el historial más extenso
```

`scripts/validar.ts` genera los PDFs en `output/` y escribe
`output/informe-validacion.md` comparando, por cliente: movimientos (XLSX vs HTML del
portal), totales, `Saldo histórico` y `Saldo I-WISP`.

## 5. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor en desarrollo con recarga |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm run start` | Ejecuta `dist/` (requiere `npm run build` previo) |
| `npm test` | Suite de tests con **vitest** (sin red: dobles de prueba y fixtures) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (config flat, TypeScript) |
| `npm run validar` | Validación end-to-end contra el portal real (ver §4) |

## 6. Cómo funciona

```
┌─────────────┐   login + reCAPTCHA v3    ┌──────────────────┐
│  UI (EJS)   │ ────────────────────────► │  Portal I-WISP   │
│  express    │   GET /, PDF por cliente  │  cloud.iwisp.mx  │
└──────┬──────┘                           └────────┬─────────┘
       │  pedir PDF                                │
       ▼                                           │
┌──────────────────────────────────────────┐       │
│ service/generar.ts (orquestación)        │       │
│  1. session.ensure()                     │       │
│  2. ClientSource  → GET /api/getClient   │◄──────┤ datos maestros + balance
│  3. MovementSource→ XLSX (primario)      │◄──────┤ histórico de movimientos
│                   ↘ HTML (respaldo)      │◄──────┤
│  4. normalizar tipos/fechas/importes     │
│  5. totales + verificación de saldo      │
│  6. plantilla HTML → puppeteer → PDF     │
└──────────────────────────────────────────┘
```

- **Fuente primaria**: exportación XLSX oficial (`/clientes/movimientos-xlsx/{id}`);
  **respaldo**: tabla HTML (`/clientes/facturas_cobranza/{id}`). Ambas detrás de la
  misma interfaz `MovementSource`; ninguna otra capa sabe cuál se usó.
- **Tipos**: `FX`/`CO` del XLSX y `title="Factura|Cobranza|Nota de Débito|Nota de Crédito"`
  del HTML → `factura` / `cobranza` (`DX` = cargo, `CX` = abono; ver `design.md` D9).
- **Saldos**: `saldoPendiente = Σ facturas − Σ cobranzas` sobre el histórico completo.
  La columna `balance` del portal **no** se usa en ningún cálculo, sólo como referencia.

## 7. La sesión del portal

El portal exige login con **reCAPTCHA v3** (token obtenido por flujo HTTP `anchor`→`reload`,
sin navegador) y una cadena de dos pasos: `GET /sesion` **antes** de
`POST /sesion/seleccion` (geocerca). La sesión (`PHPSESSID`):

1. se establece una vez y se **persiste** en `portal.cookies.json`;
2. se reutiliza mientras esté vigente (`IWISP_SESSION_TTL_MS`, 8 min por defecto);
3. se **renueva automáticamente** si una petición rebota al login, con **un solo
   reintento** por petición (nunca en bucle).

## 8. Solución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| `Faltan variables de entorno requeridas: …` | `.env` ausente o incompleto | Copia `.env.example` a `.env` y rellena las 4 obligatorias |
| `Login rechazado: …` (`AUTH`) | Credenciales inválidas o el portal rechazó el token de CAPTCHA | Revisa `.env`; reintenta (el token se pide de nuevo en cada login) |
| `El portal sigue exigiendo login tras renovar la sesión` | Cookies corruptas o sesión huérfana | Borra `portal.cookies.json` y relanza |
| `PortalNoDisponible … 302` | El portal respondió algo inesperado | Reintenta; si persiste, verifica el portal en el navegador |
| `Tipo de movimiento no reconocido: "XX"` | El portal agregó un código nuevo | Añadir el mapeo en `src/sources/parse.ts` + test |
| `SinMovimientos` / `ExtraccionError` | Tabla vacía o markup cambiado | Nunca se entrega un PDF parcial; la UI informa la causa concreta |
| `Saldo histórico` ≠ `Saldo I-WISP` | Movimientos fuera del export o ajustes manuales | El PDF muestra **ambos** saldos con nota de discrepancia; revisar en el portal |
| Cliente antiguo (id < 450): recuento HTML `n/d` | Ese cliente no tiene página HTML en el portal | Se usa el XLSX oficial (válido por cliente) |
| `EADDRINUSE` al arrancar | Puerto ocupado | Cambia `PORT` en `.env` o libera el puerto |

## 9. Validación end-to-end (resultado)

Ejecutada con `npm run validar` contra el portal real (`output/informe-validacion.md`):

- **5/5 clientes** con recuento XLSX ↔ HTML idéntico (450 → 36/36, 452 → 33/33,
  453 → 40/40, 461 → 19/19, 472 → 40/40).
- **6/6 clientes** con `saldo histórico == saldo I-WISP`: sin discrepancias.
- **Historial extenso**: el deudor más largo de 287 clientes tiene 49 movimientos y su
  PDF sale en 3 páginas sin pérdida de filas (el caso >100 filas está cubierto por el
  test sintético de `tests/render.test.ts`).

Detalle y decisiones en `openspec/changes/archive/2026-10-07-add-estado-cuenta-pdf/`
(`design.md`, `tasks.md`, `proposal.md`) y los specs principales en `openspec/specs/`.

## 10. Estructura del proyecto

```
src/
  config.ts              # carga de .env y defaults (incluye PORT)
  log.ts                 # logger con redacción de secretos
  domain/
    types.ts             # RawMovimiento, Movimiento, ClienteIwisP, Totales, …
    ports.ts             # PortalSession, MovementSource, ClientSource
    errors.ts            # AuthError, ExtraccionError, SinMovimientosError, …
    totals.ts            # cálculo de totales y verificación de saldo
    estadoCuenta.ts      # composición del resultado final
  portal/
    http.ts              # cliente HTTP (undici, redirect manual)
    recaptcha.ts         # token reCAPTCHA v3 por flujo HTTP
    cookieJar.ts         # cookies de sesión
    session.ts           # login + persistencia + renovación automática
    apiClient.ts         # /api/getClient, /api/getClientDebt
  sources/
    parse.ts             # normalización de tipos, importes y fechas
    xlsxSource.ts        # fuente primaria (export XLSX)
    htmlSource.ts        # respaldo (tabla #tabla_cta_cte_reducida)
    composite.ts         # XLSX → HTML con degradación
  pdf/
    template.ts          # plantilla HTML/CSS del documento
    render.ts            # render con puppeteer, paginación, nombre de archivo
  service/generar.ts     # orquestación: sesión → datos → movimientos → PDF
  ui/
    app.ts               # rutas de express
    server.ts            # punto de entrada del servidor
views/                   # index.ejs (listado), error.ejs
scripts/validar.ts       # validación end-to-end contra el portal
tests/                   # vitest, sin red (dobles y fixtures)
openspec/                # specs y change archive
```

## 11. Notas de seguridad

- `.env`, `*.cookies.json`, `output/`, `*.pdf` y `*.xlsx` están en `.gitignore`.
- El logger **siempre** redacta API Key, contraseña y cookies (`Redactor` en `src/log.ts`).
- La herramienta es de **solo lectura** contra I-WISP: no escribe nada en el portal.
- No genera CFDI ni documentos con validez fiscal.
