## 1. Spike: sesión de WhatsApp (puerta de todo lo demás)

- [ ] 1.1 Instalar `whatsapp-web.js` y resolver la convivencia con `puppeteer@23` (`executablePath` al Chrome ya descargado o `PUPPETEER_SKIP_DOWNLOAD`); confirmar que `npm run typecheck`, `npm run lint` y `npm test` siguen en verde
- [ ] 1.2 Script temporal fuera del repo que levante la sesión con QR y envíe **un** mensaje de prueba a un número controlado
- [ ] 1.3 Registrar el resultado en `design.md` (D5 y el riesgo de doble Chromium): se confirma el enfoque o se replantea antes de seguir

## 2. Acceso operativo

- [ ] 2.1 Añadir `APP_USER` / `APP_PASSWORD` a `.env.example` y `.env`, y extender la redacción de secretos del logger a la nueva llave
- [ ] 2.2 Rutas `/login` y `/logout` con cookie firmada y TTL, y middleware que protege todas las rutas (sin sesión → redirige)
- [ ] 2.3 Validación de la llave en local con hash derivado de `scrypt`, con mensaje de rechazo genérico y **cero** peticiones al portal
- [ ] 2.4 Selector "¿quién envía?" obligatorio antes de crear cualquier trabajo
- [ ] 2.5 Tests: sin sesión redirige, llave incorrecta no revela el campo, validación sin llamada al portal, trabajo sin operador no se crea

## 3. Datos: enriquecimiento y consulta por teléfono

- [ ] 3.1 Ampliar `ClienteIwisP` y `mapCliente` con `estatus`, `fecha_suspension`, `geocerca`, `zona`, `telefono`, `email`
- [ ] 3.2 `fetchClientesConAdeudo` enriquecido con `getClient` en fan-out (concurrencia limitada a 8, caché en memoria por proceso)
- [ ] 3.3 Consulta de `getClient` por `telefono` en `apiClient` (200 → cliente, 406 → no encontrado)
- [ ] 3.4 Estados de error para "listado enriquecido incompleto" (no presentarlo como completo)
- [ ] 3.5 Tests con fakes: enriquecimiento completo, cliente sin `celular` ni `telefono` conservado como no contactable, teléfono sin correspondencia

## 4. Menú de plataforma

- [ ] 4.1 Layout con el menú de tres secciones (Suspendidos · Estados de cuenta · Mensajes personalizados) bajo sesión activa
- [ ] 4.2 Filtro de geocerca con conteos, que persiste al cambiar de sección, con grupo "Sin geocerca"
- [ ] 4.3 Estado de error del listado que oculta los controles de envío
- [ ] 4.4 Trasladar la tabla actual de deudores con su descarga individual a la sección de estados de cuenta (sin perder la funcionalidad)
- [ ] 4.5 Tests de rutas: menú requiere sesión, filtro aplicado, descarga individual sigue funcionando

## 5. Gateway de WhatsApp

- [ ] 5.1 `src/whatsapp/`: cliente con `LocalAuth` (`.wwebjs_auth/`), máquina de estados `starting → qr → ready → auth_failure/disconnected` y su publicación a la interfaz
- [ ] 5.2 Normalización de teléfonos portada del script de referencia (10 dígitos → `52`+, rango 11–15) con sus tests
- [ ] 5.3 `sendText` y `sendDocument` (PDF con pie de página) y manejo de "número no registrado en WhatsApp"
- [ ] 5.4 Pantalla de QR con el número vinculado y control para cerrar la sesión de WhatsApp
- [ ] 5.5 Tests con doble de cliente: estado, envío de texto, envío de documento, número no registrado

## 6. Cola de envíos única y persistente

- [ ] 6.1 Modelos de trabajo e intento, con persistencia *append-only* en `cola.jsonl`
- [ ] 6.2 Worker con **un trabajo activo a la vez**, orden FIFO y espera configurable (30 s por defecto) entre envíos
- [ ] 6.3 Reconstrucción del estado al arrancar, con **Reanudar manual** (nunca automático) y **Detener** que conserva lo ya enviado
- [ ] 6.4 API de progreso (enviados / pendientes / errores / operador / siguiente) y vista de cola accesible desde el menú
- [ ] 6.5 Auditoría `envios.jsonl` por intento: operador, sección, cliente, teléfono, geocerca, estado y error
- [ ] 6.6 Rechazo de un segundo trabajo mostrando cuál está activo y en qué punto va
- [ ] 6.7 Tests: reanudación sin repetir enviados, un trabajo a la vez, detención conserva lo entregado, un intento por cliente cuando dos comparten teléfono

## 7. Seguridad de envío

- [ ] 7.1 Consentimiento obligatorio en las tres secciones
- [ ] 7.2 Preflight con `getNumberId`: registrados / no registrados en WhatsApp / números inválidos, con conteos
- [ ] 7.3 Lote piloto con confirmación del operador antes de liberar el resto
- [ ] 7.4 Freno automático ante errores consecutivos (pausa del trabajo + motivo)
- [ ] 7.5 Tests de cada guardia (sin consentimiento, preflight, piloto, freno)

## 8. Sección: Suspendidos

- [ ] 8.1 Lectura del Excel con columnas Nombre, Teléfono, Monto pendiente y Fecha de suspensión, reconociendo alias y la variación "Fecha de suspencion"
- [ ] 8.2 Vista previa con el mensaje generado por fila y el conteo de filas descartadas; archivo ilegible o vacío no permite iniciar
- [ ] 8.3 Plantilla editable precargada con el mensaje del script de referencia, con variables resueltas por fila
- [ ] 8.4 Enlace a la cola: requiere operador, consentimiento, WhatsApp conectado y ningún trabajo activo
- [ ] 8.5 Tests: parseo con alias, filas incompletas descartadas, plantilla por defecto y variables

## 9. Sección: Estados de cuenta

- [ ] 9.1 Selección de destinatarios: clientes con teléfono utilizable, filtro de geocerca activo y reporte de excluidos "sin teléfono"
- [ ] 9.2 Pie de página editable precargado, con variables por cliente (`{nombre}`, `{saldo}`, `{localidad}`, `{fecha}`)
- [ ] 9.3 Generación del PDF completo justo antes de enviar cada uno; un fallo individual queda registrado y **no** detiene el trabajo
- [ ] 9.4 Reporte de no enviados con motivo (sin teléfono / no registrado en WhatsApp)
- [ ] 9.5 Tests: número compartido por dos clientes envía los dos documentos, fallo de PDF no aborta el trabajo, nunca se entrega un PDF parcial

## 10. Sección: Mensajes personalizados

- [ ] 10.1 Lectura del Excel con Nombre y Teléfono, vista previa y conteo de descartadas
- [ ] 10.2 Cruce fila a fila contra `getClient` por `telefono`: agrupación por geocerca y grupo "Sin localidad" visible con independencia del filtro
- [ ] 10.3 Selección de uno o varios contactos y mensaje obligatorio → cola única
- [ ] 10.4 Tests: cruce encontrado / no encontrado, mensajes vacíos y selección vacía bloquean el trabajo

## 11. Integración y calidad

- [ ] 11.1 `.gitignore`: `emc-whatsapp-web-v3/`, `.wwebjs_auth/`, `cola.jsonl`, `envios.jsonl`
- [ ] 11.2 README: nuevas variables de entorno, menú de tres secciones, cola reanudable, auditoría y advertencia de riesgo del envío masivo
- [ ] 11.3 `npm run typecheck`, `npm run lint` y `npm test` en verde
- [ ] 11.4 Recorrido manual end-to-end: login → filtro de geocerca → un mensaje de prueba por cada sección → verificar `envios.jsonl`
- [ ] 11.5 Verificar que el flujo actual de descarga individual de PDF sigue intacto
