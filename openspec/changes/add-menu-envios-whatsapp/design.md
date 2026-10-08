## Context

EMC cobra por WhatsApp con 4 operadores internos. El proyecto actual sólo **genera y descarga** el PDF del estado de cuenta de un cliente con adeudo; entrega el PDF en `output/` y no manda nada. La cobranza masiva vive en un script ajeno (`emc-whatsapp-web-v3/`, copiado al repo sin trackear) que corre en su propio proceso, con su propio QR y su propio loop de envíos **dentro del navegador**, sin registro de lo enviado.

Verificado contra la API de I-WISP en vivo durante el descubrimiento (504 `getClientDebt` + 504 `getClient` en ~40 s con 8 hilos):

| Hecho | Valor |
|---|---|
| Deudores | **504** |
| Con teléfono (celular o telefono) | **468** (445 + 27) — **36 sin ninguno**, todos en ACTOPAN |
| `celular` de la lista vs `getClient` | 445/445 coinciden; **23** tienen teléfono sólo en `getClient` |
| estatus | Activo 228 · **Suspendido 189** · Activo temporal 87 |
| `fecha_suspension` | presente en 189/189 suspendidos |
| geocerca | **504/504 presente**, 2 valores: **ACTOPAN 350 · ZUMPANGO 154** |
| localidades (1er segmento de `localidad`) | 23 · municipios 4 · `zona` 13 |
| `servicios[].localidad` | **vacío en 108/504** y discrepa en 12 → descartado como clave |
| email | **0/504** → no existe canal alternativo |
| deuda lista vs `balance` | 504/504 idénticas |
| `GET /api/getClient` por `telefono` | funciona (200 / 406) — habilita el cruce de Excels |
| números compartidos | **9 números × 2 clientes** (468 contactables = 459 números únicos) |

Restricciones del proyecto: la herramienta es **solo lectura** contra I-WISP; Node ≥ 20, Express + EJS sin build de frontend; secretos sólo en `.env`; el logger redacta API Key, contraseña y cookies.

## Goals / Non-Goals

**Goals:**

- Un **un proceso** (puerto 3000) con las tres secciones del menú, una sola sesión de WhatsApp y una sola cola de envíos.
- Enviar por WhatsApp los estados de cuenta generados por este proyecto y los mensajes (cobranza y personalizados) que hoy se hacen a mano.
- **Atribuir** cada envío al operador que lo disparó, con auditoría persistente.
- Agrupar y filtrar las tres secciones por **geocerca**.
- Preservar el comportamiento del script de Erick (formato de Excel, plantilla, normalización de teléfonos, validación en WhatsApp, delay, consentimiento) **sin modificar su carpeta**.
- Mantener la descarga individual de PDF funcionando tal como está hoy.

**Non-Goals:**

- Modificar `emc-whatsapp-web-v3/` o ejecutar su servidor.
- Usar endpoints de escritura de I-WISP (suspender/habilitar servicio, ajustes de saldo).
- Canal de envío distinto de WhatsApp (0/504 clientes tienen correo).
- Cuentas de operador con alta de usuarios (diferible; D7 deja la ruta abierta).
- Despliegue, process manager o reverse proxy.
- Recalcular saldos: la lista de adeudos ya coincide con `balance` 504/504.

## Decisions

### D1 · Un solo proceso; adaptar el script de Erick, no importarlo

**Elegido**: integrar en `emc-iwisp` la *conducta* de `server.js`/`app.js` (QR, `phone()`, `getNumberId`, consentimiento, delay, plantilla, parseo de Excel) y dejar `emc-whatsapp-web-v3/` intacta en `.gitignore` como referencia.

**Alternativas descartadas**: (a) link crudo a su app en el puerto 3001 → dos procesos, dos sesiones, dos QR, y su `POST /api/send` quedaría sin control de acceso; (b) compartir `.wwebjs_auth` entre procesos → `LocalAuth` no tolera dos procesos sobre la misma carpeta; (c) `require()` de su `server.js` → es CommonJS con `express@5` y `app.listen()` propio: nos robaría el puerto y su app no sabe de nuestras rutas.

**Por qué un solo proceso**: una sesión, una cola, una puerta de acceso, una auditoría. Su carpeta queda sólo como material de referencia.

### D2 · `geocerca` es la clave de localidad

**Elegido**: agrupar/filtrar por `geocerca` (2 grupos). Mostrar `zona` (13) y el 1er segmento de `localidad` (23) como detalle en fila si hace falta.

**Alternativas descartadas con datos**: `servicios[].localidad` → vacío en 108/504 y discrepa en 12; `localidad` top-level → 23 grupos y no corresponde a lo que la operación llama localidad; municipio (2º segmento) → 4 grupos y sólo coincide con `geocerca` en 277/504.

### D3 · Enriquecer los 504 con `getClient` (fan-out)

`getClientDebt` sólo entrega `id, nombre, celular, deuda`. Sin enriquecer no hay geocerca, ni estatus, ni los 23 teléfonos que sólo viven en `getClient`.

**Elegido**: fan-out con concurrencia limitada (8 hilos, ~40 s para 504), caché en memoria por proceso, refresco bajo demanda. El listado completo se sirve ya enriquecido; el filtro por geocerca se calcula sobre esa caché.

**Alternativa descartada**: enriquecer sólo los que se van a enviar → la sección 1 y la 3 necesitan geocerca antes de decidir nada.

### D4 · La cola vive en el servidor y persiste en disco

**Elegido**: trabajos definidos por la UI → `cola.jsonl` (append-only) → worker en proceso. Un **trabajo activo a la vez**. Cerrar la pestaña no detiene nada; al arrancar con un trabajo interrumpido se ofrece **Reanudar** (no se reanuda solo: un reinicio tras horas offline no debe reanudar un disparo de 468 mensajes sin que alguien lo confirme).

**Alternativas descartadas**: (a) loop en el navegador, como hace hoy Erick → el trabajo muere con la pestaña (por eso su advertencia de pérdida); (b) cola en memoria → `tsx watch` y cualquier reinicio pierden un trabajo de 4 h; (c) trabajos concurrentes → dos flujos martillando el mismo número sin rate-limit compartido.

### D5 · Gateway de WhatsApp con `whatsapp-web.js`

Un `Client` con `LocalAuth` (`.wwebjs_auth/`), máquina de estados `starting → qr → ready → auth_failure/disconnected` publicada a la UI, `sendText` y **`sendDocument` vía `MessageMedia.fromFilePath`** (esto último es nuevo: el script de Erick sólo manda texto). La UI muestra el QR y el número vinculado, tal como su panel.

### D6 · Teléfonos: la normalización de Erick, verificada contra los datos

Port de `phone()`: 10 dígitos → prefijo `52`; rango 11–15; fuera de rango → inválido y reportado, sin intento de envío. Los **9 números compartidos por 2 clientes reciben los dos documentos**: son cuentas distintas y el `envios.jsonl` distingue cliente por cliente. Preflight con `getNumberId` para separar *registrados / no registrados en WhatsApp* antes de disparar.

### D7 · Puerta con llave del `.env` + selector "¿quién envía?"

`APP_USER` / `APP_PASSWORD` (llave **propia** de la aplicación, no la contraseña del portal: una fuga no debe abrir las dos puertas). Comparación **local** con hash derivado de `scrypt` (`node:crypto`, sin dependencias nuevas) — jamás se valida contra el portal vivo, porque eso dispararía reCAPTCHA y geocerca en cada ingreso. Sesión por cookie firmada con TTL. Cada trabajo exige el selector "¿quién envía?" y ese nombre se escribe en cada registro de `envios.jsonl`.

**Alternativas descartadas**: cuentas por operador → alto alcance para 4 usuarios internos y no aporta lo que hoy falta (atribución); selector sólo → sin puerta, cualquiera en la red entra; login contra el portal → costoso y frágil.

**Ruta abierta**: si más adelante se quieren cuentas reales, se agrega `operators.json` (hash + rol) sin tocar la puerta ni la cola.

### D8 · Seguridad de envío (mitigación, no garantía)

`whatsapp-web.js` no es una API oficial. Secuencia obligatoria antes del disparo completo:

```
  1. consentimiento marcado        → sin él, no se crea el trabajo
  2. preflight getNumberId         → clasifica: registrados / no registrados / inválidos
  3. lote piloto (5 mensajes)      → se confirma antes de liberar el resto
  4. delay configurable (30 s)     → espera entre envíos, siempre
  5. freno automático              → N errores consecutivos → la cola se pausa y avisa
  6. Detener siempre visible       → corta el trabajo; lo ya enviado se conserva
```

### D9 · PDF generado bajo demanda, no en lote

Se genera el PDF **justo antes de enviar** cada mensaje (datos frescos) y se conserva en `output/` como evidencia de lo entregado. Pre-generar 468 PDFs consumiría minutos de puppeteer y decenas de MB sin ninguna ventaja. Falla de un cliente → ese cliente queda con error en el reporte y **el trabajo continúa** (la regla "nunca un PDF parcial" sigue vigente a nivel de documento).

### D10 · Ambas plantillas editables

Un `textarea` por sección con el texto por defecto ya cargado: la plantilla de cobranza de la sección 1 (literalmente la de Erick) y el caption de la sección 2. Variables resueltas por fila: `{nombre}` `{monto}` `{fecha}` en la sección 1; `{nombre}` `{saldo}` `{localidad}` `{fecha}` en la sección 2. La sección 3 no tiene plantilla: el mensaje se escribe.

### D11 · Auditoría en JSONL, sin base de datos

`envios.jsonl`, append-only: `{ts, operador, seccion, clienteId, nombre, telefono, geocerca, canal, estado, error}`. Cabe en el estilo actual del proyecto (stateless, sin dependencias). SQLite queda como evolución si algún día se quieren reportes agregados.

### D12 · Filas del Excel que no cruzan con I-WISP (sección 3)

Si `getClient?telefono` devuelve 406, la fila **se envía igual** (el Excel es la fuente del destinatario) y se agrupa bajo **"Sin localidad"**, visible independientemente del filtro. Se invertirá a "no enviar" cambiando un solo punto si se prefiere.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| `whatsapp-web.js` no oficial: desconexión, restricción o bloqueo del número | D8 completo; el riesgo **se reduce, no se elimina** — se dice al operador en la UI |
| Doble Chromium: `whatsapp-web.js` fija `puppeteer@24`, aquí está `^23` | Spike de instalación; apuntar `executablePath` al Chrome ya instalado y/o `PUPPETEER_SKIP_DOWNLOAD` si ya hay binario |
| Trabajo de ~4 h vs `tsx watch` (reinicia en cada guardado) y caídas | Cola persistente + **Reanudar** + visibilidad del progreso |
| Sesión de WhatsApp caducada a mitad del trabajo | Los envíos fallan con estado claro; la cola se pausa; la UI pide re-escanear QR y luego Reanudar |
| 468 PDFs acumulados en `output/` | Se conservan como evidencia; limpieza manual (documentado). Retención automática = fuera de alcance |
| 36 clientes sin teléfono y 9 no registrados en WhatsApp | Preflight los reporta; **no se les envía** y quedan en `envios.jsonl` con su motivo |
| Dos operadores abren la app a la vez | Un trabajo a la vez (D4); el segundo ve el trabajo activo y no puede disparar |
| La puerta usa una llave distinta pero vive en el mismo `.env` | `APP_PASSWORD` separada de la del portal; el logger ya redacta secretos y se extiende a la nueva |
| El script de Erick queda fuera del control de acceso | Se dejó de usar: su carpeta es referencia, no ejecutable |

## Migration Plan

Implementación por fases, cada una reversible y con la app usable al final de cada una:

1. **Spike de dependencia** — instalar `whatsapp-web.js`, levantar la sesión con QR y enviar un mensaje de prueba. Si falla, se detiene todo aquí antes de escribir el resto.
2. **Puerta + menú** — login, sesión, menú con tres secciones y filtro por geocerca; la descarga individual sigue funcionando dentro de la sección 2.
3. **Datos** — enriquecimiento de los 504 con `getClient`, tipos ampliados y consulta por teléfono.
4. **Gateway + cola** — sesión WhatsApp, cola persistente, progreso, Reanudar/Detener, auditoría.
5. **Secciones** — 1 (Excel suspendidos), 2 (estados de cuenta con PDF), 3 (mensajes personalizados).
6. **Seguridad de envío** — preflight, piloto, freno y consentimiento en las tres.

**Rollback**: la puerta se puede desactivar por variable de entorno; la cola y la auditoría son archivos nuevos que no afectan al flujo actual; si el gateway no conecta, las secciones muestran "WhatsApp no conectado" y la descarga de PDFs sigue operativa.

## Open Questions

- **Retención de `output/`**: ¿cuántos PDFs conservamos antes de limpiar? (decisión de operación, no bloquea)
- **`N` del freno automático**: ¿3 errores consecutivos? y ¿el piloto de 5 es el número correcto?
- **TTL de la sesión de la aplicación**: ¿8 h, fin de jornada, o algo más corto?
- **Reanudación**: confirmar que Reanudar sea manual (así está diseñado) y no automática al arrancar.
- **Variable de activación del gateway** (`WHATSAPP_ENABLED`) o siempre intentar conectar al arrancar.
- **Spike de instalación** de `whatsapp-web.js@1.34.7` junto a `puppeteer@23` en Windows.
