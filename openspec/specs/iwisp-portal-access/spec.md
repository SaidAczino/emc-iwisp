## Purpose
Define cómo el sistema se autentica contra el portal I-WISP (`cloud.iwisp.mx:4434`) y obtiene de él los datos maestros del cliente y su histórico de movimientos, incluyendo el manejo de credenciales fuera del repositorio y el modo de falla ante errores de autenticación o de extracción.

## Requirements

### Requirement: Acceso autenticado al portal de I-WISP
El sistema SHALL mantener una sesión autenticada contra el portal `cloud.iwisp.mx:4434` utilizando las credenciales de portal (wisp id, usuario y contraseña), y SHALL reutilizar esa sesión para múltiples operaciones subsecuentes.

#### Scenario: Sesión ausente y login exitoso
- **WHEN** no hay sesión almacenada y las credenciales son válidas
- **THEN** el sistema obtiene una sesión válida y la persiste para reutilizarla

#### Scenario: Sesión existente y vigente
- **WHEN** existe una sesión almacenada dentro de su vigencia
- **THEN** el sistema la reutiliza sin ejecutar un nuevo login

#### Scenario: Sesión expirada durante el uso
- **WHEN** una petición al portal responde con redirección a la pantalla de login
- **THEN** el sistema renueva la sesión y reintenta la petición una sola vez

#### Scenario: Credenciales inválidas
- **WHEN** el login es rechazado por el portal
- **THEN** el sistema reporta un error de autenticación identificable y NO genera ningún PDF

### Requirement: Obtención de datos maestros del cliente
El sistema SHALL obtener los datos maestros y el saldo de un cliente mediante `GET /api/getClient`, enviando la API Key de la licencia. El saldo obtenido por este endpoint SHALL considerarse la fuente autorizada del saldo del cliente.

#### Scenario: Cliente con saldo y servicios
- **WHEN** se solicita un cliente existente
- **THEN** el sistema obtiene nombre, domicilio, localidad, tipo de servicio, RFC, servicios asociados y saldo

#### Scenario: Cliente inexistente
- **WHEN** el identificador no corresponde a ningún cliente
- **THEN** el sistema reporta un error de cliente no encontrado y no genera PDF

### Requirement: Obtención de movimientos de cuenta
El sistema SHALL obtener el histórico completo de movimientos de un cliente. La fuente primaria SHALL ser el endpoint de exportación `XLSX` del portal; si dicha fuente no está disponible o no entrega datos válidos, el sistema SHALL recurrir a la tabla HTML de la página de facturas y cobranza.

#### Scenario: Fuente primaria disponible
- **WHEN** la exportación XLSX responde con movimientos legibles
- **THEN** el sistema la utiliza y no consulta el HTML

#### Scenario: Respaldo a la fuente HTML
- **WHEN** la exportación XLSX falla o no entrega movimientos legibles
- **THEN** el sistema extrae los movimientos de la tabla HTML y registra que se recurrió al respaldo

#### Scenario: Ambas fuentes sin resultados
- **WHEN** ninguna fuente entrega al menos un movimiento
- **THEN** el sistema falla con un error explícito de extracción y NO genera un PDF vacío ni un PDF con cero filas

### Requirement: Credenciales fuera del repositorio
El sistema SHALL leer la API Key y las credenciales de portal exclusivamente desde variables de entorno, y SHALL garantizar que el archivo `.env` esté excluido del control de versiones.

#### Scenario: Credenciales no expuestas en logs
- **WHEN** el sistema registra errores, trazas o diagnósticos
- **THEN** ninguna entrada contiene la API Key, la contraseña del portal ni el contenido de la cookie de sesión

#### Scenario: Repositorio sin secretos
- **WHEN** se inspecciona el historial de git
- **THEN** no existe ningún archivo conteniendo credenciales reales

### Requirement: Modo de falla en la extracción
Ante un fallo de autenticación o de extracción, el sistema SHALL reportar el error al operador con una causa identificable y SHALL NOT generar un documento parcial o incorrecto.

#### Scenario: Portal no disponible
- **WHEN** el portal de I-WISP no responde o responde con error
- **THEN** el sistema informa el fallo sin generar PDF y sin dejar archivos de salida parciales
