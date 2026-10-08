## ADDED Requirements

### Requirement: Sesión de WhatsApp con código QR
La aplicación SHALL mantener una sesión de WhatsApp con `whatsapp-web.js` persistida en disco, SHALL exponer su estado a la interfaz y SHALL mostrar el código QR cuando sea necesario vincular el número.

#### Scenario: Arranque sin sesión vinculada
- **WHEN** la aplicación arranca y no existe una sesión de WhatsApp vinculada
- **THEN** la interfaz muestra el estado "escanea el código QR" junto con la imagen del QR

#### Scenario: Sesión lista
- **WHEN** el operador escanea el QR con el teléfono del número deseado
- **THEN** la aplicación persiste la sesión, oculta el QR y muestra el estado "conectado" con el número vinculado

#### Scenario: Sesión desconectada
- **WHEN** la sesión de WhatsApp se pierde o caduca
- **THEN** la aplicación lo indica en la interfaz y bloquea la creación de trabajos de envío hasta recuperarla

#### Scenario: Sesión tras reinicio
- **WHEN** la aplicación se reinicia con una sesión persistida vigente
- **THEN** la restablece automáticamente sin volver a pedir el escaneo del QR

### Requirement: Envío de mensajes de texto y documentos
La aplicación SHALL enviar mensajes de texto y archivos PDF por WhatsApp, validando previamente que el número normalizado esté registrado en WhatsApp.

#### Scenario: Envío de texto a un número registrado
- **WHEN** se envía un texto a un número que pasa la validación de WhatsApp
- **THEN** la aplicación entrega el mensaje y registra el envío como enviado

#### Scenario: Envío de documento con pie de página
- **WHEN** se envía un PDF con un texto de acompañamiento
- **THEN** la aplicación entrega el documento adjunto con ese texto como pie de página y registra el envío

#### Scenario: Número no registrado en WhatsApp
- **WHEN** la validación determina que el número no está en WhatsApp
- **THEN** la aplicación registra el intento como "no registrado en WhatsApp", no envía nada y continúa con el siguiente destinatario

#### Scenario: Número fuera del rango válido
- **WHEN** el teléfono normalizado no queda dentro del rango de longitud válida
- **THEN** la aplicación registra el intento como "número inválido", no realiza la validación ni el envío, y continúa con el siguiente destinatario

#### Scenario: Fallo durante el envío
- **WHEN** el envío a un destinatario lanza un error
- **THEN** la aplicación registra el error en ese destinatario y continúa con el siguiente sin abortar el trabajo

### Requirement: Cola de envíos única, persistente y reanudable
La aplicación SHALL mantener una única cola de trabajos de envío, persistida en disco, con un solo trabajo activo a la vez, cuyo progreso SHALL seguirse desde la interfaz y cuyo avance SHALL sobrevivir al cierre de la pestaña, al cierre de sesión y al reinicio del proceso.

#### Scenario: Solicitud de un segundo trabajo
- **WHEN** ya hay un trabajo activo y el operador intenta iniciar otro
- **THEN** la aplicación rechaza el nuevo trabajo e informa cuál es el activo y en qué punto va

#### Scenario: Cierre de la pestaña con trabajo activo
- **WHEN** el operador cierra o cambia de pestaña con un trabajo en curso
- **THEN** el trabajo continúa ejecutándose en el servidor y su progreso se conserva

#### Scenario: Reinicio con trabajo interrumpido
- **WHEN** la aplicación arranca y detecta en disco un trabajo que no había terminado
- **THEN** lo presenta con la opción de reanudarlo y no continúa enviando hasta que el operador lo confirme

#### Scenario: Reanudación
- **WHEN** el operador confirma la reanudación de un trabajo interrumpido
- **THEN** la aplicación continúa con los destinatarios pendientes, sin repetir los que ya fueron enviados

#### Scenario: Detención manual
- **WHEN** el operador activa la detención de un trabajo en curso
- **THEN** la aplicación deja de enviar, conserva lo ya entregado y marca el trabajo como detenido

#### Scenario: Progreso visible
- **WHEN** hay un trabajo activo
- **THEN** la interfaz muestra enviados, pendientes, errores, el operador responsable y el trabajo que sigue en cola

### Requirement: Seguridad de envío masivo
Antes de liberar un envío masivo, la aplicación SHALL exigir el consentimiento del operador, SHALL clasificar los destinatarios contra WhatsApp, SHALL enviar primero un lote piloto, SHALL respetar una espera configurable entre envíos y SHALL pausar el trabajo ante errores consecutivos.

#### Scenario: Consentimiento ausente
- **WHEN** se intenta iniciar un trabajo sin haber confirmado que los contactos autorizaron recibir estos mensajes
- **THEN** la aplicación no crea el trabajo

#### Scenario: Preflight de destinatarios
- **WHEN** un trabajo está listo para enviarse
- **THEN** la aplicación clasifica los destinatarios en registrados, no registrados en WhatsApp y números inválidos antes del primer envío, y muestra los conteos

#### Scenario: Lote piloto
- **WHEN** el preflight termina en un trabajo masivo
- **THEN** la aplicación envía primero un lote pequeño y sólo continúa con el resto cuando el operador lo confirma

#### Scenario: Espera entre envíos
- **WHEN** un trabajo está enviando
- **THEN** la aplicación espera el intervalo configurado (30 s por defecto) entre un envío y el siguiente, incluidos los que fallan

#### Scenario: Errores consecutivos
- **WHEN** se producen errores consecutivos en los envíos de un trabajo
- **THEN** la aplicación pausa el trabajo automáticamente, informa el motivo y espera una decisión del operador

### Requirement: Auditoría de envíos
La aplicación SHALL registrar cada intento de envío en un archivo de auditoría con el operador responsable, la sección, el cliente, el teléfono, la geocerca, el estado y el error si lo hubo.

#### Scenario: Registro de un envío enviado
- **WHEN** un mensaje se entrega correctamente
- **THEN** la auditoría guarda el operador, la sección, el cliente, el teléfono y el estado "enviado" con su marca de tiempo

#### Scenario: Registro de un envío fallido
- **WHEN** un mensaje no se entrega
- **THEN** la auditoría guarda el mismo registro con el estado correspondiente y la causa del fallo

#### Scenario: Destinatarios que comparten teléfono
- **WHEN** dos clientes distintos tienen el mismo número de teléfono
- **THEN** la auditoría registra un intento por cliente, de modo que ambos envíos quedan diferenciados

#### Scenario: Clientes sin teléfono
- **WHEN** un cliente de un trabajo no tiene ningún teléfono utilizable
- **THEN** la auditoría registra el intento como "sin teléfono" y no se realiza ninguna petición de envío
