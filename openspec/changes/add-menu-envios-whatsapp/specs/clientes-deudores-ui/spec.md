## MODIFIED Requirements

### Requirement: Listado de clientes con adeudo
La aplicación SHALL presentar el listado de clientes que mantienen saldo deudor, obtenido desde el endpoint de adeudos de I-WISP y enriquecido con los datos maestros de cada cliente, mostrando por cada uno su identificador, nombre, saldo, contacto y geocerca, y SHALL exponer ese listado dentro del menú de plataforma, después de iniciar sesión en la aplicación.

#### Scenario: Listado con clientes deudores
- **WHEN** existen clientes con saldo deudor
- **THEN** la aplicación los lista con su identificador, nombre, saldo adeudado, celular y geocerca

#### Scenario: Listado sin clientes deudores
- **WHEN** no existen clientes con adeudo
- **THEN** la aplicación muestra un estado vacío sin error

#### Scenario: Credenciales del portal requeridas para el listado
- **WHEN** no se ha establecido sesión con el portal
- **THEN** la aplicación solicita el establecimiento de sesión antes de obtener el listado

#### Scenario: Listado tras iniciar sesión en la aplicación
- **WHEN** se solicita el listado sin tener la sesión de la aplicación vigente
- **THEN** la aplicación lo redirige a la pantalla de acceso antes de mostrar nada

#### Scenario: Agrupación y filtrado por geocerca
- **WHEN** el listado está cargado y enriquecido
- **THEN** la aplicación permite agruparlo y filtrarlo por geocerca, conservando el filtro al cambiar de sección
