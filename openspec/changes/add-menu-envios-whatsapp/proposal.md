## Why

EMC cobra por WhatsApp, pero hoy la operación vive repartida y sin rastro: el estado de cuenta se genera aquí y se entrega **a mano, uno por uno** (504 deudores, 468 con teléfono, 36 sin ninguno), mientras que la cobranza masiva a suspendidos vive en un script aparte (`emc-whatsapp-web-v3`) que no deja registro de quién envió ni qué. Los 4 operadores usan las mismas credenciales, así que un envío masivo queda siempre a nombre de quien prestó la llave, y la agrupación por localidad es imposible porque la lista de adeudos no la trae. Verificado contra la API en vivo: los 504 deudores reparten en **2 geocercas** (ACTOPAN 350 · ZUMPANGO 154), hay **189 suspendidos** con `fecha_suspension`, **9 números compartidos por 2 clientes** y **0 con correo** (el canal email no existe como alternativa).

## What Changes

- **Login de aplicación** con llave propia en `.env` (`APP_USER` / `APP_PASSWORD`), más un selector **"¿quién envía?"** que se registra en cada trabajo. *(BREAKING: la raíz `/` deja de estar abierta en la red.)*
- **Menú de plataforma** con tres secciones y filtro por **geocerca** (`ACTOPAN` / `ZUMPANGO`) sobre el listado de adeudos enriquecido con `getClient`.
- **Sección Suspendidos**: carga del Excel con el mismo formato del script de Erick (Nombre, Teléfono, Monto pendiente, Fecha de suspensión), preview, plantilla editable (por defecto, la de Erick) y envío masivo con delay.
- **Sección Estados de cuenta**: genera el PDF de cada deudor y lo envía por WhatsApp con caption editable. Mandar los dos documentos a los 9 números compartidos (cuentas distintas). Los 36 sin teléfono quedan reportados, no enviados.
- **Sección Mensajes personalizados**: Excel con Nombre y Teléfono, cruce fila a fila contra `GET /api/getClient` por `telefono` (verificado: 200 / 406), mensaje libre por cliente.
- **Gateway de WhatsApp** (`whatsapp-web.js`) integrado a nuestra app: una sola sesión persistente con QR, `sendText` y `sendDocument` para el PDF. La carpeta `emc-whatsapp-web-v3/` queda intacta como referencia y se agrega a `.gitignore`.
- **Cola de envíos única, en el servidor y persistida en disco**: un solo trabajo activo, progreso visible, **Reanudar** tras reinicio y **Detener** siempre disponible. Cerrar la pestaña no pierde el trabajo.
- **Auditoría** de cada envío en `envios.jsonl`: operador, sección, cliente, teléfono, estado y error.
- **Seguridad de envío**: preflight con `getNumberId`, delay de 30 s configurable, lote piloto antes del disparo completo, pausa automática ante errores consecutivos y consentimiento obligatorio.

Fuera de alcance: modificar la carpeta de Erick, endpoints de escritura de I-WISP (suspender/habilitar), canal email, cuentas por operador y despliegue.

## Capabilities

### New Capabilities
- `acceso-operativo`: puerta de acceso con la llave del `.env`, sesión de aplicación y selector de operador que atribuye cada trabajo.
- `menu-plataforma`: menú con las tres secciones y el filtro por geocerca sobre el listado de deudores enriquecido.
- `envio-whatsapp`: gateway de WhatsApp (sesión QR, texto y documento), cola única persistente con un trabajo a la vez, controles de progreso y seguridad de envío, y auditoría de resultados.
- `suspendidos-excel`: sección de suspendidos alimentada por el Excel en el formato del script de Erick.
- `estado-cuenta-whatsapp`: sección que genera y envía los estados de cuenta por WhatsApp.
- `mensajes-personalizados`: sección que cruza un Excel de nombre y teléfono contra I-WISP y envía un mensaje libre.

### Modified Capabilities
- `clientes-deudores-ui`: el listado pasa a exigir sesión, a vivir bajo el menú de tres secciones y a agruparse/filtrarse por geocerca; se conserva la descarga individual de PDF.
- `iwisp-portal-access`: `getClient` además se invoca por `telefono` para cruzar Excels, el listado de adeudos se enriquece con datos maestros (geocerca, estatus, fecha de suspensión, teléfonos), y la redacción de secretos se extiende a la llave de la aplicación.

## Impact

- **Código**: `src/ui/app.ts` (middleware de sesión y rutas del menú), `views/` (login, menú y tres secciones); nuevos `src/auth/`, `src/whatsapp/`, `src/cola/`; `src/domain/types.ts` ampliado con `estatus`, `fecha_suspension`, `geocerca`, `zona`, `telefono`, `email`; `src/portal/apiClient.ts` con consulta por teléfono y enriquecimiento del listado.
- **Dependencias**: `whatsapp-web.js` (instala `puppeteer` 24 junto al 23 ya presente — verificar instalación y Chrome).
- **Entorno**: nuevas `APP_USER` / `APP_PASSWORD`; `.gitignore` += `emc-whatsapp-web-v3/`.
- **Archivos de runtime**: `output/` con los PDFs enviados, `envios.jsonl`, `cola.jsonl` y `.wwebjs_auth/` (fuera del control de versiones).
- **Riesgo operativo**: `whatsapp-web.js` no es una API oficial; el envío masivo puede derivar en desconexión de la sesión o restricción del número. Mitigado con delay, lote piloto, preflight y freno automático — no eliminado.
