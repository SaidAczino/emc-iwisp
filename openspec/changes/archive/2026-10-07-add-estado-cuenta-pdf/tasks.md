## 1. Spike de autenticación (throwaway — determina la arquitectura)

- [x] 1.1 Script mínimo en carpeta `spike/` (NO se commitea): POST de login a `cloud.iwisp.mx:4434` con wisp id, usuario y contraseña; volcar las cookies recibidas.
- [x] 1.2 Con esas cookies, GET a `/clientes/facturas_cobranza/453` y verificar si llegan las 40 filas esperadas de movimientos.
- [x] 1.3 Verificar si la página acepta credenciales sin sesión (probablemente no: ya se probó `?api_key=` y redirige al login).
- [x] 1.4 Registrar el hallazgo: ruta de login, formato de la sesión, si hay CAPTCHA / WAF / segundo paso, y duración de la sesión.
- [x] 1.5 DESCARTAR el spike y documentar la conclusión en `design.md` → sección Open Questions.

## 2. Andamiaje del proyecto

- [x] 2.1 Inicializar proyecto Node + TypeScript con lint y typecheck.
- [x] 2.2 Crear `.env.example` con `IWISP_API_KEY`, `IWISP_WISP_ID`, `IWISP_USERNAME`, `IWISP_PASSWORD`.
- [x] 2.3 Agregar `.env` al `.gitignore` ANTES del primer commit; verificar que ningún secreto quede en el historial.
- [x] 2.4 Implementar un logger que redacte API Key, contraseña y cookies en cualquier salida.
- [x] 2.5 Agregar dependencias: cliente HTTP, parser HTML, lector de XLSX, renderer de PDF, y framework de UI.

## 3. Interfaces (antes que la lógica — ver D3 y D2)

- [x] 3.1 Definir `PortalSession { ensure(): Promise<Session>; fetchPage(path): Promise<string>; }`.
- [x] 3.2 Definir `MovementSource { fetchMovimientos(idCliente): Promise<RawMovimiento[]>; }`.
- [x] 3.3 Definir `ClientSource { fetchCliente(idCliente): Promise<ClienteIwisP>; }`.
- [x] 3.4 Definir los tipos `RawMovimiento`, `Movimiento`, `ClienteIwisP`, `Totales` y `ResultadoEstadoCuenta`.
- [x] 3.5 Añadir tests que usen dobles de prueba en lugar de red.

## 4. Acceso al portal

- [x] 4.1 Implementar `PortalSession` según el camino que determine el spike (HTTP puro, Playwright con `storageState`, o sesión cacheada manual).
- [x] 4.2 Persistir la sesión con vigencia; renovarla automáticamente al detectar redirección al login, con un solo reintento por petición.
- [x] 4.3 Implementar `ClientSource` contra `GET /api/getClient` con la API Key en el body.
- [x] 4.4 Mapear la respuesta de `getClient` al tipo `ClienteIwisP` (nombre, domicilio, localidad, RFC, tipo de servicio, servicios con plan y costo, y `balance` como saldo reportado).
- [x] 4.5 Manejar cliente inexistente como error identificable, distinguiéndolo de un fallo de autenticación.

## 5. Fuentes de movimientos

- [x] 5.1 Implementar `HtmlMovementSource` sobre `/clientes/facturas_cobranza/{id}`: extraer filas con atributo `title="Cobranza|Factura"`.
- [x] 5.2 Leer el tipo **exclusivamente** del atributo `title`; no usar `style="color:..."` ni el texto de la celda (D8).
- [x] 5.3 Validar que cada fila tenga exactamente el número esperado de celdas; fallar explícitamente si la estructura cambió.
- [x] 5.4 Implementar `XlsxMovementSource` sobre `/clientes/movimientos-xlsx/{id}` como fuente primaria, con degradación al HTML si falla o no entrega datos legibles.
- [x] 5.5 Normalizar el tipo a `factura` / `cobranza`.
- [x] 5.6 Parsear el importe quitando símbolo de moneda, espacios y separadores de miles → magnitud absoluta.
- [x] 5.7 Parsear la fecha en formato `dd/mm/aaaa hh:mm:ss` (NUNCA ISO: `new Date("03/10/2026")` interpretaría marzo 10).
- [x] 5.8 Copiar el campo `detalle` literalmente, sin interpretarlo ni normalizarlo (D7).
- [x] 5.9 Mapear la referencia de cobranza vacía (`-`) a valor vacío.
- [x] 5.10 Capturar el identificador del movimiento desde el `onclick` de la fila (`/cobranza/ver/{id}` o `/factura/ver/FX/{id}`) para referencia interna.
- [x] 5.11 Implementar la guarda de integridad: cero movimientos, o filas sin atributo de tipo → error explícito, nunca PDF vacío (D2).

## 6. Cálculo de totales y verificación

- [x] 6.1 Calcular `totalFacturado` = Σ importe de movimientos tipo factura.
- [x] 6.2 Calcular `totalCobrado` = Σ importe de movimientos tipo cobranza; cero si no hay cobranzas.
- [x] 6.3 Calcular `saldoPendiente` = totalFacturado − totalCobrado sobre el histórico completo (D4).
- [x] 6.4 **No** usar la columna `balance` del portal en ningún cálculo; solo conservar el valor original para referencia.
- [x] 6.5 Comparar `saldoPendiente` contra `getClient.balance` y exponer el resultado de la verificación.
- [x] 6.6 Si difieren, emitir advertencia al operador sin bloquear la generación.
- [x] 6.7 Ordenar los movimientos cronológicamente para el PDF.
- [x] 6.8 Tests de cálculo con importes grandes y separadores de miles.

## 7. Generación del PDF

- [x] 7.1 Construir la plantilla HTML/CSS del estado de cuenta (encabezado EMC, marca visible de "documento de cortesía sin validez fiscal" — D6).
- [x] 7.2 Bloque de datos del cliente: nombre, domicilio, localidad, RFC y servicios con plan y costo.
- [x] 7.3 Manejar campos ausentes (p. ej. sin RFC) mostrándolos como "no disponible" sin romper la generación.
- [x] 7.4 Tabla de movimientos: tipo, número, referencia, detalle, importe, fecha; con distinción visual entre factura y cobranza.
- [x] 7.5 Paginación automática cuando el histórico exceda una página, repitiendo el encabezado de tabla en cada página y sin perder movimientos.
- [x] 7.6 Pie con `totalFacturado`, `totalCobrado` y `saldoPendiente`.
- [x] 7.7 Pie con los dos saldos etiquetados: `Saldo histórico calculado` y `Saldo según I-WISP`, con nota de coincidencia o discrepancia (D5).
- [x] 7.8 Nombre de archivo que identifique al cliente y evite colisiones.
- [x] 7.9 Cliente sin movimientos → no generar documento, reportar la situación.
- [x] 7.10 Test de render con un cliente de más de 100 movimientos para verificar paginación.

## 8. UI de clientes deudores

- [x] 8.1 Obtener el listado desde `GET /api/getClientDebt` (ojo: este endpoint usa `api`, no `api_key`, a diferencia del resto).
- [x] 8.2 Renderizar la tabla: identificador, nombre, celular y saldo adeudado.
- [x] 8.3 Estado vacío cuando no hay clientes con adeudo.
- [x] 8.4 Botón de descarga por fila que genera y entrega el PDF de ese cliente.
- [x] 8.5 Propagar los errores al operador con causa identificable; nunca entregar un archivo parcial.
- [x] 8.6 Solicitar el establecimiento de sesión antes de obtener el listado si no hay sesión vigente.

## 9. Validación end-to-end

- [x] 9.1 Generar estados de cuenta de 3–5 clientes reales y compararlos **a mano** contra el portal: movimientos, totales y saldos.
- [x] 9.2 Confirmar que el `saldoPendiente` calculado coincide con el saldo del portal en los casos donde debe coincidir, y documentar los casos donde no.
- [x] 9.3 Probar un cliente con historial extenso para confirmar que no hay truncamiento.
- [x] 9.4 Verificar que ningún secreto aparece en logs, archivos de salida ni el historial de git.
- [x] 9.5 Documentar en un README el procedimiento de arranque, la configuración de `.env` y qué hacer cuando la sesión expira.