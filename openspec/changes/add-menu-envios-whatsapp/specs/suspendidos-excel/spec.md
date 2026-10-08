## ADDED Requirements

### Requirement: Carga del Excel de suspendidos
La sección de Suspendidos SHALL aceptar un archivo Excel cuya primera hoja contenga las columnas **Nombre**, **Teléfono**, **Monto pendiente** y **Fecha de suspensión**, reconociendo los alias y la variación ortográfica que ya reconoce el script de referencia, y SHALL mostrar una vista previa con el mensaje generado por fila antes de enviar.

#### Scenario: Archivo válido
- **WHEN** se carga un Excel con las cuatro columnas requeridas
- **THEN** la aplicación muestra el total de registros válidos y una vista previa con nombre, teléfono, monto, fecha y mensaje generado por fila

#### Scenario: Reconocimiento de alias de columna
- **WHEN** el archivo trae los nombres de columna con alias reconocidos o con la variación "Fecha de suspencion"
- **THEN** la aplicación los interpreta como las columnas esperadas

#### Scenario: Filas incompletas
- **WHEN** una fila no tiene alguno de los cuatro datos requeridos
- **THEN** la aplicación excluye esa fila de la vista previa y del envío, y la cuenta como descartada

#### Scenario: Archivo ilegible o vacío
- **WHEN** el archivo no se puede leer o no contiene filas válidas
- **THEN** la aplicación informa la causa y no permite iniciar ningún trabajo

### Requirement: Plantilla de cobranza editable
La sección SHALL ofrecer una plantilla de mensaje cargada por defecto con el texto del script de referencia, editable por el operador, y SHALL resolver sus variables con los datos de cada fila.

#### Scenario: Plantilla por defecto
- **WHEN** el operador entra a la sección
- **THEN** la aplicación muestra el mensaje de cobranza por defecto ya cargado en un campo editable

#### Scenario: Edición de la plantilla
- **WHEN** el operador modifica el texto de la plantilla
- **THEN** el envío utiliza el texto modificado para todas las filas del trabajo

#### Scenario: Variables por fila
- **WHEN** se genera el mensaje de una fila
- **THEN** la aplicación sustituye los datos personales (nombre, monto y fecha) con los valores de esa fila

### Requirement: Envío masivo de suspendidos
La sección SHALL enviar el mensaje a las filas del Excel mediante la cola única de envíos, atribuido al operador seleccionado, y SHALL impedir el inicio si WhatsApp no está conectado o si ya hay un trabajo activo.

#### Scenario: Inicio del envío
- **WHEN** hay Excel cargado, plantilla, operador, consentimiento, WhatsApp conectado y no hay trabajo activo
- **THEN** la aplicación crea el trabajo en la cola y comienza a enviar con el intervalo configurado

#### Scenario: WhatsApp no conectado
- **WHEN** la sesión de WhatsApp no está lista
- **THEN** la aplicación no permite iniciar el envío e indica que hay que vincular el número

#### Scenario: Trabajo ya activo
- **WHEN** ya hay un trabajo en la cola
- **THEN** la aplicación no crea un trabajo nuevo e informa cuál está activo y en qué punto va
