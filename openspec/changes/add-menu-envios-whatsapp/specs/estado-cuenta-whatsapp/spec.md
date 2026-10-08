## ADDED Requirements

### Requirement: Selección de destinatarios del estado de cuenta
La sección SHALL tomar como destinatarios a los clientes con adeudo enriquecidos con sus datos maestros, excluir a los que no tengan ningún teléfono utilizable, aplicar el filtro de geocerca activo y enviar los dos documentos cuando dos clientes compartan el mismo número.

#### Scenario: Destinatarios con teléfono
- **WHEN** el operador prepara el trabajo con el listado enriquecido
- **THEN** la aplicación incluye a los clientes con `celular` o `telefono` utilizable y reporta cuántos quedan excluidos por no tener ninguno

#### Scenario: Filtro de geocerca activo
- **WHEN** hay una geocerca seleccionada en el menú
- **THEN** el trabajo incluye únicamente los clientes de esa geocerca

#### Scenario: Números compartidos por dos clientes
- **WHEN** dos clientes con adeudo distinto tienen el mismo teléfono
- **THEN** la aplicación envía un estado de cuenta por cada uno de los dos clientes a ese número

### Requirement: Generación y envío del estado de cuenta
Para cada destinatario la aplicación SHALL generar el PDF completo de su estado de cuenta antes de enviarlo, y SHALL adjuntarlo por WhatsApp con un pie de página editable cargado por defecto. Un fallo en un cliente SHALL NO detener el trabajo ni entregar documentos parciales.

#### Scenario: Envío con pie de página por defecto
- **WHEN** el operador no modifica el pie de página
- **THEN** cada PDF se envía con el texto por defecto ya cargado en la interfaz

#### Scenario: Pie de página editado
- **WHEN** el operador modifica el texto del pie de página
- **THEN** ese texto se usa en todos los envíos del trabajo y se sustituyen sus variables con los datos de cada cliente

#### Scenario: Fallo al generar el PDF de un cliente
- **WHEN** la generación del PDF de un destinatario falla
- **THEN** la aplicación registra ese destinatario como fallido con su causa, entrega un PDF completo a los demás y no genera ningún archivo parcial

#### Scenario: Ningún PDF parcial
- **WHEN** se entrega un estado de cuenta
- **THEN** el documento entregado es el resultado completo de la generación, con sus movimientos y sus saldos

### Requirement: Reporte de destinatarios no enviados
La sección SHALL presentar, antes y después del trabajo, el detalle de los clientes que no se les envía y el motivo.

#### Scenario: Clientes sin teléfono
- **WHEN** el listado enriquecido incluye clientes sin `celular` ni `telefono`
- **THEN** la aplicación los lista como no enviados con el motivo "sin teléfono"

#### Scenario: Número no registrado en WhatsApp
- **WHEN** el preflight determina que un número no está en WhatsApp
- **THEN** la aplicación lista a ese cliente como no enviado con el motivo correspondiente y no incluye su PDF en el trabajo
