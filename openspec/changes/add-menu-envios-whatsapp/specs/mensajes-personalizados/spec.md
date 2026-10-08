## ADDED Requirements

### Requirement: Carga del Excel de contactos
La sección de Mensajes personalizados SHALL aceptar un archivo Excel cuya primera hoja contenga las columnas **Nombre** y **Teléfono**, y SHALL presentar una vista previa de los contactos antes de permitir el envío.

#### Scenario: Archivo válido
- **WHEN** se carga un Excel con nombre y teléfono
- **THEN** la aplicación muestra el total de contactos válidos y su vista previa

#### Scenario: Filas incompletas
- **WHEN** una fila no tiene nombre o teléfono
- **THEN** la aplicación la excluye de la vista previa y la cuenta como descartada

#### Scenario: Archivo ilegible o vacío
- **WHEN** el archivo no se puede leer o no contiene filas válidas
- **THEN** la aplicación informa la causa y no permite iniciar ningún trabajo

### Requirement: Cruce de contactos contra I-WISP
Para cada fila, la aplicación SHALL buscar el cliente en I-WISP mediante `GET /api/getClient` con el teléfono, SHALL agrupar los contactos por la `geocerca` del cliente encontrado y SHALL presentar aparte a los que no correspondan a ningún cliente.

#### Scenario: Contacto encontrado
- **WHEN** el teléfono corresponde a un cliente de I-WISP
- **THEN** la aplicación lo agrupa bajo la geocerca de ese cliente y puede enriquecerlo con sus datos

#### Scenario: Contacto no encontrado
- **WHEN** el teléfono no corresponde a ningún cliente
- **THEN** la aplicación lo presenta en un grupo identificado como "Sin localidad", visible con independencia del filtro de geocerca activo

#### Scenario: Teléfono compartido por varios clientes
- **WHEN** un teléfono corresponde a más de un cliente
- **THEN** la aplicación usa el cliente que devuelve la API y deja constancia en la vista previa

### Requirement: Mensaje personalizado por contacto
La sección SHALL permitir al operador seleccionar uno o varios contactos, escribir el mensaje que desea enviarle y encolarlo por la cola única de envíos atribuido al operador seleccionado.

#### Scenario: Selección y envío
- **WHEN** el operador selecciona contactos, escribe un mensaje y confirma
- **THEN** la aplicación crea un trabajo que envía ese mensaje a cada contacto seleccionado con el intervalo configurado

#### Scenario: Mensaje vacío
- **WHEN** el operador confirma sin haber escrito un mensaje
- **THEN** la aplicación no crea el trabajo e indica que el mensaje es obligatorio

#### Scenario: Sin contactos seleccionados
- **WHEN** el operador confirma sin seleccionar ningún contacto
- **THEN** la aplicación no crea el trabajo

#### Scenario: Trabajo ya activo
- **WHEN** ya hay un trabajo en la cola
- **THEN** la aplicación no crea un trabajo nuevo e informa cuál está activo y en qué punto va
