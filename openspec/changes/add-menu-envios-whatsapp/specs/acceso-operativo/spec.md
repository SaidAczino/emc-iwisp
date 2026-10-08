## ADDED Requirements

### Requirement: Puerta de acceso con la llave de la aplicación
La aplicación SHALL exigir una sesión iniciada para cualquier ruta, y SHALL aceptar el acceso únicamente cuando la llave de la aplicación (`APP_USER` / `APP_PASSWORD`) coincide con la almacenada en el entorno. La validación SHALL realizarse localmente y SHALL NOT realizar ninguna petición al portal I-WISP.

#### Scenario: Ruta solicitada sin sesión
- **WHEN** un navegador solicita cualquier ruta sin tener una sesión vigente
- **THEN** la aplicación lo redirige a la pantalla de acceso sin ejecutar la acción solicitada

#### Scenario: Llave correcta
- **WHEN** se envía la llave de la aplicación correcta
- **THEN** la aplicación crea una sesión y permite el acceso al menú

#### Scenario: Llave incorrecta
- **WHEN** se envía una llave incorrecta
- **THEN** la aplicación rechaza el acceso con un mensaje genérico que no indique cuál de los campos es incorrecto

#### Scenario: Validación sin contacto con el portal
- **WHEN** se valida una llave, sea correcta o incorrecta
- **THEN** no se realiza ninguna petición de login ni de cualquier otro tipo a `cloud.iwisp.mx:4434`

### Requirement: Sesión de aplicación
La aplicación SHALL mantener la sesión iniciada mediante una cookie firmada con un tiempo de vigencia limitado, y SHALL ofrecer el cierre de sesión.

#### Scenario: Sesión vigente
- **WHEN** el operador vuelve a solicitar una ruta dentro de la vigencia de la sesión
- **THEN** la aplicación atiende la solicitud sin volver a pedir la llave

#### Scenario: Sesión expirada
- **WHEN** se solicita una ruta con una sesión fuera de su vigencia
- **THEN** la aplicación invalida la cookie y redirige a la pantalla de acceso

#### Scenario: Cierre de sesión
- **WHEN** el operador activa el cierre de sesión
- **THEN** la aplicación invalida la cookie y cualquier solicitud posterior requiere volver a entrar

### Requirement: Atribución del operador en cada trabajo
La aplicación SHALL exigir seleccionar el operador responsable antes de crear cualquier trabajo de envío, y SHALL registrar ese operador en cada uno de los intentos de envío del trabajo.

#### Scenario: Trabajo sin operador seleccionado
- **WHEN** se intenta iniciar un trabajo sin haber elegido el operador responsable
- **THEN** la aplicación no crea el trabajo e indica que debe elegirse quién envía

#### Scenario: Trabajo atribuido
- **WHEN** el operador selecciona quién envía y dispara un trabajo
- **THEN** cada intento de envío del trabajo queda registrado con el nombre de ese operador

#### Scenario: Cambio de operador durante un trabajo
- **WHEN** hay un trabajo activo y se cambia el operador seleccionado
- **THEN** los envíos ya registrados conservan el operador con el que se crearon y los siguientes usan el nuevo
