## Why

EMC gestiona la cobranza de sus clientes sobre el portal de I-WISP Manager, un sistema de terceros al que no tenemos acceso a la base de datos. Hoy, para entregarle su estado de cuenta a un cliente, un operador tiene que entrar al portal, navegar a Facturación y Cobranza, descargar el PDF que I-WISP genera y enviarlo a mano.

El PDF de I-WISP no sirve para eso: no incluye los datos del cliente (domicilio, RFC, contacto), no tiene encabezado de nuestra empresa, y **no calcula totales ni saldo pendiente**. Además obliga al operador a moonlight en el portal por cada cliente.

Queremos una herramienta interna que genere el estado de cuenta completo, con nuestros datos y nuestros totales, bajo demanda y con un botón por cliente.

## What Changes

- **Nueva aplicación interna** que genera un PDF de "Estado de Cuenta" por cliente, cubriendo el histórico completo de movimientos de cuenta corriente.
- **Nueva fuente de datos: scraping del portal de I-WISP.** La API pública de I-WISP (27 endpoints documentados) **no expone los movimientos de cuenta**; sólo entrega el saldo total y los datos maestros del cliente. Los movimientos hay que obtenerlos del portal web, que es PHP server-rendered.
- **Nueva UI con botón por cliente.** Lista de clientes con adeudo y descarga individual del PDF.
- **Los totales se calculan nosotros**, a partir de `Importe` + `Tipo` de cada movimiento. **No** se reutiliza la columna `Balance` del portal: se verificó que no es un running balance coherente (oscila entre $300/$600/$900 de forma inexplicable), replicarla propagaría un bug de I-WISP a nuestros documentos.
- **El PDF muestra dos saldos al pie**, etiquetados y sin promediar: el saldo histórico calculado por nosotros y el saldo que reporta I-WISP. Si difieren, se agrega una nota al pie. Esto protege en soporte y delata si la extracción de datos falló silenciosamente.
- El documento es de **cortesía, sin validez fiscal**: no incluye UUID ni sello del SAT.
- El campo `Detalle` se copia literalmente. **No** se interpreta ni se infiere el periodo facturado a partir de la `Fecha` (en I-WISP el detalle "MES DE MAYO" puede tener fecha de julio).
- Volumen y usuarios reales: **4 personas**. El diseño optimiza por simplicidad y mantenimiento mínimo, no por escala.

## Capabilities

### New Capabilities

- `iwisp-portal-access`: Autenticación contra el portal de I-WISP y obtención de datos (datos maestros vía API Key, movimientos vía scraping del portal), con caché de sesión y sanities de integridad.
- `movimiento-normalization`: Conversión de las filas crudas del portal a un modelo de movimiento normalizado (tipo, número, importe, fecha, detalle), con las validaciones necesarias para no fallar en silencio.
- `estado-cuenta-pdf`: Cálculo de totales y saldos, y generación del PDF de estado de cuenta con encabezado de EMC, tabla de movimientos e histórico paginado.
- `clientes-deudores-ui`: Listado de clientes con adeudo y botón de descarga individual del PDF.

### Modified Capabilities

Ninguna. Es el primer cambio del proyecto; no hay specs existentes en `openspec/specs/`.

## Impact

**Sistema externo (solo lectura, con sesión):** portal `cloud.iwisp.mx:4434`. Endpoints usados:
- `GET /api/getClient` — datos maestros y saldo (API Key en el body). Es la fuente **autorizada** del saldo.
- `GET /clientes/movimientos-xlsx/{id}` — fuente **primaria** de movimientos (aún sin verificar).
- `GET /clientes/facturas_cobranza/{id}` — **fallback** de movimientos (HTML de la tabla).
- `POST /login` — sesión del portal (**sin verificar**; es el único *unknown* del proyecto).

**Ningún endpoint de escritura.** El cambio no modifica datos en I-WISP.

**Secretos en riesgo:** la API Key y la credencial del portal dan acceso total a los clientes del ISP. Debe vivir en `.env` con `.env` en `.gitignore`, y nunca escribirse en logs.

**Formato del portal:** se parsea una tabla con 7 `<td>` fijos y un atributo `title="Cobranza|Factura"` como única señal de tipo (no se usa `style="color:green|red"`, que es presentación). Riesgo residual de breakage cuando I-WISP cambie su markup; mitigado por la separación en una interfaz `MovementSource` intercambiable.