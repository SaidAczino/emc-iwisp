## ADDED Requirements

### Requirement: Menú con las tres secciones
La aplicación SHALL presentar, una vez iniciada la sesión, un menú con las tres secciones de uso de plataforma: **Suspendidos**, **Estados de cuenta** y **Mensajes personalizados**.

#### Scenario: Menú accesible
- **WHEN** el operador con sesión vigente entra a la aplicación
- **THEN** la aplicación muestra el menú con las tres secciones disponibles

#### Scenario: Selección de sección
- **WHEN** el operador elige una sección
- **THEN** la aplicación muestra esa sección conservando el filtro de geocerca activo

### Requirement: Filtrado por geocerca
La aplicación SHALL agrupar y filtrar los clientes por su `geocerca`, presentando las geocercas existentes con el número de clientes de cada una. El filtro SHALL aplicarse a las tres secciones del menú.

#### Scenario: Geocercas disponibles
- **WHEN** el listado de deudores está enriquecido con los datos maestros
- **THEN** la aplicación ofrece una geocerca por cada valor presente, con el conteo de clientes de cada una

#### Scenario: Geocerca seleccionada
- **WHEN** el operador elige una geocerca
- **THEN** las tres secciones presentan únicamente los clientes de esa geocerca

#### Scenario: Sin geocerca seleccionada
- **WHEN** el operador no elige ninguna geocerca
- **THEN** las tres secciones presentan todos los clientes sin filtrar

#### Scenario: Clientes sin geocerca
- **WHEN** un cliente no tiene `geocerca` en sus datos maestros
- **THEN** la aplicación lo presenta en un grupo identificado como "Sin geocerca" y no lo descarta

### Requirement: Estado de error del listado
La aplicación SHALL informar la causa concreta cuando no se pueda cargar el listado de deudores, sin habilitar envíos sobre un listado incompleto.

#### Scenario: Fallo al obtener el listado
- **WHEN** la obtención de los deudores o su enriquecimiento falla
- **THEN** la aplicación muestra la causa del fallo y no ofrece los controles de envío de las secciones
