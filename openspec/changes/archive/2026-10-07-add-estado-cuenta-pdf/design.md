## Context

EMC opera un ISP y gestiona la cobranza sobre **I-WISP Manager**, un portal de terceros (`cloud.iwisp.mx:4434`) al que no tenemos acceso a base de datos. La operación real son **4 personas** de administración.

Los movimientos de cuenta corriente (facturas y cobranzas) existen en la tabla `#tabla_cta_cte_reducida` de la página `/clientes/facturas_cobranza/{id}`. Esa página es **PHP server-rendered**: los movimientos vienen en el HTML inicial, no en un endpoint JSON. Los únicos requests XHR de la página son dos *pollers* (`actualiza_notificaciones.php`, `actualiza_avisos.php`) que no participan.

La API pública de I-WISP (27 endpoints en `api-i-wisp-manager.readme.io`) **no expone movimientos**. Sí expone datos maestros y saldo vía `GET /api/getClient` con API Key.

**Hallazgos de la exploración que condicionan el diseño** (obtenidos analizando el HTML real y un `.har` de la navegación):

1. ~~El `.har` no contiene cookies~~ → **RESUELTO EN EL SPIKE**: la autenticación es **HTTP puro** (sin navegador). Flujo verificado: `POST /login` (form con `id_empresa`, `user`, `pass`, `token`, `iniciar_a`) → `302 /sesion` + cookie `PHPSESSID`; después **segundo paso obligatorio**: `POST /sesion/seleccion` con `seleccion_id=ALL_GEO` (o el id de la geocerca) y `seleccion_recordar=on` → `302 /`. Sin ese paso, el portal responde `302 /redirect/sesion` o un script de 81 bytes `window.location="/login"`.
   - **CAPTCHA: sí.** reCAPTCHA v3 invisible (sitekey `6Ld1FjwrAAAAAB-eRtB4N7vT_1LJoIt5r8YsDAOK`), validado en servidor (token inventado ⇒ `iwisp_message_bounce("Error, código incorrecto")`; sin `token` ⇒ silencio). El token v3 se obtiene por el flujo HTTP `anchor` → `reload` de Google, sin navegador.
   - **Sesión:** cookie `PHPSESSID` (`path=/`, sin `Expires` = cookie de sesión). Vigencia observada ≥ 10 min; el TTL exacto del servidor no se midió (requiere espera real). La renovación bajo demanda del diseño lo cubre.
   - **Credenciales sin sesión: no.** La página y el XLSX responden el redirect de login; `?api_key=` no autentica el portal.
   - `GET /api/getClient` y `GET /api/getClientDebt` **no** aceptan query string ni form: responden `400`. Funcionan con **POST JSON** (`api_key` + `idcliente` / `api_key`), sin sesión de portal.
2. El parseo de la tabla es **1:1 y limpio**: 7 `<td>` fijos por fila. La señal de tipo más confiable es el atributo `title="Cobranza|Factura"`, no `style="color:green|red"` (presentación).
3. La columna `balance` del portal **no es un running balance**. Ordenando el histórico cronológicamente oscila entre $300/$600/$900 de forma inexplicable. **No se puede usar para calcular totales ni replicar en el PDF.**
4. La tabla se llama `_reducida`. No hay evidencia de tope de filas (para el cliente 453, sus 40 movimientos arrancan en su fecha de alta), pero el nombre sugiere que I-WISP podría recortar el histórico en el futuro.
5. El campo `detalle` **no es consistente con la `fecha`**: hay filas con detalle "MES DE MAYO" y fecha de julio. El detalle se copia literal.
6. ~~Existe un endpoint hermano no explorado: `/clientes/movimientos-xlsx/{id}`... **No verificado.**~~ → **VERIFICADO EN EL SPIKE**: responde `200` con XLSX válido (`PK`, `Content-Disposition: IWM_movimientos_YYYYMMDD.xlsx`), mismas 40 filas que el HTML, columnas `Tipo | Número | Cobranza | Detalle | Importe | Fecha | Balance`, con `Tipo` = `CO`/`FX` (¡no `Cobranza`/`Factura`!) y sin `onclick` (el identificador se compone de tipo+número). D2 tiene dos implementaciones reales.
6b. La documentación de la API (`api-i-wisp-manager.readme.io`) **miente en un parámetro**: dice `api` para `getClientDebt`, pero el servidor sólo acepta `api_key` (igual que el resto). `getClient` exige `idcliente`, no `id`.
7. La API Key y la credencial de portal dan acceso total a la base de clientes del ISP. Son secretos de alto impacto en un repo git.

## Goals / Non-Goals

**Goals:**

- Generar el PDF de estado de cuenta de un cliente bajo demanda, con botón por cliente.
- Documento propio de EMC: encabezado, datos del cliente, domicilio, servicios, histórico completo de movimientos, totales y saldos al pie.
- Cálculo de totales propio a partir de `Importe` + `Tipo`, independiente del `balance` del portal.
- Historico completo, no limitado a un periodo.
- Sobrevivir a un cambio de markup en I-WISP sin reescribir el PDF.
- Mantenimiento mínimo: 4 usuarios, ~20 PDFs al mes, Windows local y migración futura a Linux.

**Non-Goals:**

- **No** generar CFDI ni documentos con validez fiscal. Es cortesía interna.
- **No** escribir nada en I-WISP. La herramienta es de solo lectura.
- **No** escalar a alta concurrencia ni multi-instancia.
- **No** almacenar una base de datos local de movimientos (no hay requirement de historial propio; I-WISP es la fuente de verdad).
- **No** enviar por WhatsApp. Ese requerimiento queda pendiente.
- **No** modificar ni parchear el PDF que genera I-WISP.

## Decisions

### D1 — Reconstruir el PDF desde cero, no adaptar el de I-WISP

**Elegido:** renderizar HTML/CSS propio y convertirlo a PDF.

**Alternativas descartadas:**
- *Superponer campos sobre el PDF de I-WISP con coordenadas fijas.* Descartada por los totales. La tabla del PDF crece con el número de movimientos: un cliente con 200 filas ocupa 3 páginas y no hay dónde colocar un pie de totales sin hardcodear layout por versión. Adicionalmente obliga a conocer la geometría del PDF original, que es frágil y no versionada.
- *Descargar el PDF de I-WISP tal cual.* Descartada: es exactamente lo que el usuario pidió corregir (sin datos de cliente, sin totales).

**Consecuencia:** el PDF de I-WISP deja de ser un insumo. Su único uso posible es diagnóstico.

### D2 — XLSX primario, HTML como respaldo, ambos detrás de una interfaz

**Elegido:** definir `MovementSource` con dos implementaciones (XLSX y HTML) y que ninguna otra parte del sistema sepa cuál se usó.

**Alternativas descartadas:**
- *Acoplarse al HTML permanentemente.* Se descarta acoplar "para siempre" sin abstraer: la decisión se toma una vez y se descubre cuando algo falla. La abstracción cuesta ~20 líneas y hace que revertir una decisión sea cambiar una clase.
- *Acoplarse al XLSX directamente.* Se descarta porque **el endpoint nunca se descargó ni verificó**. No hay evidencia de que responda, de que traiga las mismas filas, ni de su formato. Construir sobre una suposición no verificada es peor que una abstracción barata.

**Riesgo residual:** el XLSX probablemente sí se usará, porque los exportadores `.php` en ERPs viejos son a menudo más frágiles que la vista (pueden pedir otra sesión o devolver un archivo vacío ante caracteres-Geheimen). Por eso el "0 filas → error explícito" es requisito en ambas implementaciones, no solo en el fallback.

### D3 — Sesión inyectada (`PortalSession`), no acoplada

**Elegido:** una interfaz `PortalSession { ensure(); fetchPage(path); }`. El scraper, la API y el PDF nunca saben si debajo hay `fetch` nativo o un navegador automatizado.

**Por qué es la decisión importante:** los tres caminos de autenticación (HTTP puro, Playwright con `storageState`, sesión cacheada manual) son intercambiables, y **cambiar de camino después no debe tocar el scraper ni el PDF**. Hoy la única variable sin verificar es justamente la autenticación; esta interfaz es lo que permite decidirla empíricamente sin rediseñar.

**Riesgo oculto no discutido antes:** la API Key y la contraseña del portal dan acceso total a los clientes del ISP. Con 4 usuarios y git, esto se blinda desde el día uno (`.env` + `.gitignore`, y cero secretos en logs).

### D4 — No calcular el `balance`; calcular totales desde `Importe` + `Tipo`

**Elegido:** `Total facturado = Σ importe(tipo=factura)`, `Total cobrado = Σ importe(tipo=cobranza)`, `Saldo pendiente = diferencia`. La columna `balance` del portal se ignora por completo.

**Por qué:** se verificó que no es aritmética de saldos. Si se replicara, el PDF emitiría con un bug de I-WISP como si fueraEMC. El importe y el tipo son datos duros; el balance es una decisión de diseño dudosa del ERP.

**Consecuencia aceptada:** el `Saldo pendiente` calculado (histórico) puede no coincidir con el saldo que el cliente ve en su portal, que es un saldo *actual*. De ahí D5.

### D5 — Doble saldo al pie, etiquetado, sin promediar

**Elegido:** el documento muestra `Saldo histórico calculado` y `Saldo según I-WISP`, con nota explícita de coincidencia o discrepancia.

**Alternativa descartada:** mostrar un solo número. Descartada porque hay dos definiciones legítimas de "saldo pendiente" y son matemáticamente distintas. Ocultar la discrepancia no la arregla: la convierte en un reclamo en soporte. Mostrar ambas con etiquetas hace que cualquier diferencia sea un dato, no un bug.

**Consecuencia:** la comparación cumple doble función — informa al cliente **y** actúa como *sanity check* de que la extracción no truncó datos. Es la red que detecta la amenaza de `_reducida`.

### D6 — PDF de cortesía, sin validez fiscal

**Elegido:** sin UUID ni sello del SAT. El requisito es un documento interno de cortesía.

**Consecuencia:** esto debe quedar explícito en el encabezado del documento para que nadie lo use como comprobante. Los identificadores de factura (`/factura/ver/FX/{id}`) sí se conservan en la tabla como referencia interna.

### D7 — El `detalle` se copia literal, sin interpretar

**Elegido:** no se infiere el periodo facturado desde la fecha ni se normaliza el texto.

**Por qué:** se verificó que detalle y fecha son inconsistentes en el portal ("MES DE MAYO" con fecha de julio, "MES DE JUNIO" con fecha de agosto). Interpretar produciría periodos inventados. El documento refleja lo que el ERP registró.

### D8 — Señal de tipo: atributo `title`, nunca estilo

**Elegido:** el tipo se determina por `title="Cobranza"|"Factura"`. Se prohíbe usar `style="color:green|red"` o el texto de la celda.

**Por qué:** `title` es semántico y estable; el color es presentación y puede cambiar por un ajuste de tema sin que cambie la lógica.

### D9 — Tipos `DX`/`CX` (notas de débito/crédito) clasificados por validación empírica

**Elegido:** el XLSX trae además de `FX`/`CO` los códigos **`DX`** (HTML: `title="Nota de Débito"`) y **`CX`** (`title="Nota de Crédito"`); se normalizan `DX → factura` (cargo) y `CX → cobranza` (abono). El matching es por etiqueta sin acentos (`nota de debito`/`nota de credito`), tolerante al charset del portal.

**Por qué:** no estaba documentado en el spike y rompía la extracción en producción (clientes 7, 8, 17, 18, 44, 472…). Se decidió comparando contra `getClient.balance`: contar `DX` como cargo y `CX` como abono reproduce el saldo del portal en **todos** los clientes verificados; las hipótesis contrarias (invertidas, neutras o ambas en el mismo sentido) no. Ver `scripts/validar.ts` → `output/informe-validacion.md`.

## Risks / Trade-offs

**[La autenticación del portal no estaba verificada]** → **Resuelto por el spike: camino HTTP puro confirmado** (Camino A). Login con reCAPTCHA v3 vía HTTP + `POST /sesion/seleccion`. Sólo queda riesgo operativo: Google puede degradar el flujo `anchor`→`reload` de tokens; si ocurre, la interfaz `PortalSession` (D3) permite cambiar a Playwright sin tocar scraper ni PDF. La vigilancia es la renovación bajo demanda (4.2).

**[I-WISP cambia el markup de la tabla]** → Abstracción `MovementSource` (D2) + assertions explícitas de fallo en vez de parseo tolerante. Un PDF con cero filas o con columnas mal mapeadas es peor que un error.

**Truncación silenciosa del histórico** → Doble saldo con verificación de congruencia (D5). Si el saldo calculado difiere del de I-WISP, el documento lo dice y el operador lo ve.

**El XLSX falla en producción aunque haya funcionado en desarrollo]** → Ya está contemplado como fallback con error explícito (D2). Con 4 usuarios, las Sixteen/lecciones de mantenimiento son asumibles.

**Secretos en el repositorio** → `.env` con `.gitignore` desde el primer commit; sin secretos en logs. Costo cero ahora, incidente caro después.

**Playwright en el servidor Linux si hiciera falta** → ~300MB de dependencias del sistema. Otro argumento para preferir HTTP puro (Camino A) siempre que el spike lo permita.

**Over-engineering de la capa de sesión** → Con 4 usuarios se prefiere explícitamente el camino más simple que funcione (HTTP puro, o en su defecto sesión cacheada manual). No se construye infraestructura de auth robusta para una app de bajo volumen.

## Migration Plan

1. **Spike de autenticación** (throwaway, no se commitea el script): POST login + GET de la página de un cliente. Determina el camino de sesión.
2. **Andamiaje del proyecto**: Node + TypeScript, `.env` + `.gitignore` antes del primer commit.
3. **Interfaces primero**: `PortalSession`, `MovementSource`, `ClientSource`, y el renderer. Sin ellos no se implementa lógica de negocio.
4. **Extractores**: XLSX y HTML, ambos con sus assertions.
5. **Cálculo de totales + sanity check**.
6. **Renderer del PDF**.
7. **UI de clientes deudores + descarga**.
8. **Validación contra 3–5 clientes reales** comparando los saldos calculados contra los que muestra el portal a mano.

**Rollback:** no hay migración de datos ni esquema que revertir. La herramienta es aditiva y de solo lectura; borrar el directorio de artefactos la deja sin efecto sobre I-WISP.

## Hallazgos de la validación end-to-end (tasks 9.1–9.3)

Ejecutado con `npm run validar` contra el portal real (`scripts/validar.ts` → `output/informe-validacion.md`):

- **Recuento de movimientos (XLSX vs HTML), 5/5 clientes coincidente**: 450 → 36/36, 452 → 33/33, 453 → 40/40, 461 → 19/19, 472 → 40/40.
- **`saldoPendiente` calculado == `getClient.balance`, 6/6 clientes** (450, 452, 453, 461, 472, 91): sin discrepancias que documentar. La columna `balance` del portal se conserva sólo como referencia (D4) y no interviene en ningún cálculo.
- **Historial extenso**: el deudor más largo de los 287 tiene **49 movimientos** (cliente 91) y su PDF sale en 3 páginas sin pérdida de filas. Ningún cliente real supera 100 movimientos; ese umbral queda cubierto por el test sintético de 130 filas (`tests/render.test.ts`, task 7.10).
- **`GET /sesion` obligatorio** antes de `POST /sesion/seleccion` (corroborado en producción; ver Open Questions).
- **El XLSX real pone los datos en la columna 3** (columnas 1–2 vacías): el lector deriva el offset desde la celda `Tipo` del encabezado. Además, los índices 1–2 son huecos del array de ExcelJS, a los que `Array.prototype.findIndex` **sí** invoca el callback con `undefined` (Node 24) — por eso el localizador es defensivo.
- **El portal sirve HTML en windows-1252 sin declarar charset**: decodificar como UTF-8 rompía los acentos (`Facturación`, `Nota de Débito` → mojibake). `decodificarHtml` prueba charset declarado → UTF-8 válido → windows-1252.
- **Clientes con id < 450 no exponen la página HTML de movimientos** (responden `302 /clientes/listado`); su XLSX sí es válido y por cliente. En ese caso el recuento HTML queda como `n/d` y la fuente es el XLSX oficial.

## Open Questions

**Resueltas en el spike (2026-10-07, script desechado en `spike/`, no commiteado):**

- ~~¿Responde `/clientes/movimientos-xlsx/{id}` y con qué formato exacto?~~ → **Sí.** XLSX válido, mismas 40 filas que el HTML, `Tipo` = `CO`/`FX`. D2 tiene dos implementaciones reales; el XLSX es viable como fuente primaria.
- ~~¿El login por POST funciona, o hay CAPTCHA / WAF / requisito de sesión en dos pasos?~~ → **POST funciona**, pero exige **reCAPTCHA v3** (token v3 obtenido vía flujo HTTP `anchor`→`reload`, sin navegador) y una **cadena de dos pasos**: `GET /sesion` **antes** de `POST /sesion/seleccion` (geocerca). Saltar el `GET /sesion` hace que `seleccion` responda `302 /logout` y la sesión quede inválida (verificado en la validación). No hay WAF visible ni límite de intentos observado.
- ~~¿Cuánto vive una sesión antes de expirar?~~ → **≥ 10 min observado** (cookie `PHPSESSID` de sesión, TTL de servidor no medido). Basta con renovación bajo demanda ante redirect (tarea 4.2); no se requiere refresh en segundo plano.

**Pendiente:**

- **¿El nombre de la tabla seguirá siendo `_reducida`?** → Si I-WISP agrega un filtro de periodo al dashboard, el parseo deja de ser histórico. El sanity check de D5 es la detección; la respuesta a tiempo es una decisión de producto (¿pedir a I-WISP un endpoint de movimientos?).