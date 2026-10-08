## Purpose
Define la interfaz de la aplicación para listar a los clientes con saldo deudor y descargar individualmente el PDF del estado de cuenta de cada uno de ellos.

## Requirements

### Requirement: Listado de clientes con adeudo
La aplicación SHALL presentar el listado de clientes que mantienen saldo deudor, obtenido desde el endpoint de adeudos de I-WISP, mostrando por cada cliente su identificador, nombre, saldo y contacto.

#### Scenario: Listado con clientes deudores
- **WHEN** existen clientes con saldo deudor
- **THEN** la aplicación los lista en una tabla con su identificador, nombre, saldo adeudado y celular

#### Scenario: Listado sin clientes deudores
- **WHEN** no existen clientes con adeudo
- **THEN** la aplicación muestra un estado vacío sin error

#### Scenario: Credenciales del portal requeridas para el listado
- **WHEN** no se ha establecido sesión con el portal
- **THEN** la aplicación solicita el establecimiento de sesión antes de obtener el listado

### Requirement: Descarga individual de estado de cuenta
La aplicación SHALL ofrecer un control de descarga por cada cliente del listado, que genere el PDF de estado de cuenta de ese cliente y lo entregue al operador.

#### Scenario: Descarga exitosa
- **WHEN** el operador activa la descarga de un cliente
- **THEN** la aplicación genera el PDF de estado de cuenta de ese cliente y lo entrega como descarga

#### Scenario: Nombre del archivo descargado
- **WHEN** se genera la descarga de un cliente
- **THEN** el nombre del archivo identifica al cliente y evita colisiones entre clientes distintos

#### Scenario: Falla durante la generación
- **WHEN** la generación del PDF falla
- **THEN** la aplicación informa la causa del fallo al operador y no entrega un archivo parcial

#### Scenario: Cliente con movimientos procesado desde el listado
- **WHEN** el operador activa la descarga de un cliente que aparece en el listado de adeudos
- **THEN** el PDF generado corresponde únicamente a ese cliente
