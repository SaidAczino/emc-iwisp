## ADDED Requirements

### Requirement: Consulta de cliente por teléfono
El sistema SHALL poder obtener los datos maestros de un cliente invocando `GET /api/getClient` con la API Key y el teléfono del cliente, para cruzar listas de contactos externas contra I-WISP.

#### Scenario: Teléfono correspondiente a un cliente
- **WHEN** se invoca el endpoint con un teléfono que corresponde a un cliente
- **THEN** el sistema devuelve los datos maestros de ese cliente, incluidos estatus, geocerca, saldo y teléfonos

#### Scenario: Teléfono sin correspondencia
- **WHEN** se invoca el endpoint con un teléfono que no corresponde a ningún cliente
- **THEN** el sistema reporta que el cliente no fue encontrado, sin tratarlo como un error de autenticación

### Requirement: Enriquecimiento del listado de deudores con datos maestros
El sistema SHALL enriquecer el listado de clientes con adeudo invocando `GET /api/getClient` por cada cliente, incorporando al menos estatus, fecha de suspensión, geocerca, zona, localidad y los teléfonos del cliente, con una concurrencia limitada que no sature al portal.

#### Scenario: Listado enriquecido
- **WHEN** se solicita el listado completo de deudores con su enriquecimiento
- **THEN** el sistema entrega cada cliente con sus datos maestros y su geocerca

#### Scenario: Fallo al enriquecer un cliente
- **WHEN** la consulta de datos maestros de algún cliente falla o no responde
- **THEN** el sistema informa el fallo y no entrega un listado enriquecido incompleto presentándolo como completo

#### Scenario: Sin teléfono utilizable
- **WHEN** un cliente enriquecido no tiene `celular` ni `telefono` válidos
- **THEN** el sistema lo conserva en el listado, marcado como no contactable, en lugar de descartarlo

## MODIFIED Requirements

### Requirement: Credenciales fuera del repositorio
El sistema SHALL leer la API Key, las credenciales de portal y la llave de acceso a la aplicación exclusivamente desde variables de entorno, y SHALL garantizar que el archivo `.env` esté excluido del control de versiones.

#### Scenario: Credenciales no expuestas en logs
- **WHEN** el sistema registra errores, trazas o diagnósticos
- **THEN** ninguna entrada contiene la API Key, la contraseña del portal, la llave de la aplicación ni el contenido de la cookie de sesión

#### Scenario: Repositorio sin secretos
- **WHEN** se inspecciona el historial de git
- **THEN** no existe ningún archivo conteniendo credenciales reales
