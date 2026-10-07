## ADDED Requirements

### Requirement: Cálculo de totales por tipo de movimiento
El sistema SHALL calcular el total facturado como la suma de los importes de los movimientos de tipo factura, y el total cobrado como la suma de los importes de los movimientos de tipo cobranza.

El sistema SHALL NOT utilizar el `balance` reportado por el portal como base para el cálculo de totales, por no ser un saldo acumulado confiable.

#### Scenario: Totales de un cliente con historial completo
- **WHEN** se procesa el histórico completo de un cliente
- **THEN** el total facturado y el total cobrado reflejan la suma exacta de los importes de cada tipo

#### Scenario: Cliente con únicamente facturas
- **WHEN** el cliente no tiene movimientos de tipo cobranza
- **THEN** el total cobrado se reporta como cero

### Requirement: Saldo pendiente calculado
El sistema SHALL calcular el saldo pendiente como la diferencia entre el total facturado y el total cobrado sobre el histórico completo.

#### Scenario: Saldo pendiente de un cliente al corriente
- **WHEN** el total facturado y el total cobrado son iguales
- **THEN** el saldo pendiente se reporta como cero

### Requirement: Presentación de doble saldo al pie
El sistema SHALL presentar al pie del documento dos saldos claramente etiquetados y diferenciados: el saldo histórico calculado por el sistema y el saldo reportado por I-WISP. Cuando ambos coincidan, el documento lo SHALL indicar de forma explícita; cuando difieran, el documento SHALL incluir una nota al pie señalando la discrepancia.

#### Scenario: Saldos coincidentes
- **WHEN** el saldo calculado coincide con el saldo reportado por I-WISP
- **THEN** el documento muestra ambos importes con una anotación de coincidencia

#### Scenario: Saldos discrepantes
- **WHEN** el saldo calculado no coincide con el saldo reportado por I-WISP
- **THEN** el documento muestra ambos importes con una nota al pie que identifica la discrepancia, sin ocultar ni promediar ninguno de los dos valores

### Requirement: Contenido y encabezado del documento
El documento SHALL presentarse como estado de cuenta de cortesía sin validez fiscal, SHALL NOT incluir UUID ni sello digital del SAT, y SHALL contener los datos del cliente, el detalle de sus servicios asociados y el histórico completo de movimientos.

#### Scenario: Cliente con domicilio y servicios
- **WHEN** el cliente tiene domicilio, RFC y servicios asociados registrados
- **THEN** el documento incluye nombre, domicilio, localidad, RFC y los servicios con su plan y costo

#### Scenario: Cliente sin RFC registrado
- **WHEN** el cliente no tiene RFC registrado
- **THEN** el documento muestra el dato como no disponible y se genera sin errores

### Requirement: Presentación de la tabla de movimientos
El documento SHALL presentar los movimientos en orden cronológico, SHALL distinguir visualmente facturas y cobranzas, y SHALL paginar automáticamente cuando el histórico exceda el espacio de una página.

#### Scenario: Histórico de un solo periodo
- **WHEN** el histórico del cliente cabe en una sola página
- **THEN** el documento presenta una sola página con la tabla completa

#### Scenario: Histórico extenso
- **WHEN** el histórico del cliente excede una página
- **THEN** el documento se divide en páginas sucesivas con encabezado de tabla repetido y sin perder ningún movimiento

#### Scenario: Cliente sin movimientos
- **WHEN** el cliente no tiene movimientos en su cuenta corriente
- **THEN** el sistema no genera el documento y reporta que no hay movimientos

### Requirement: Congruencia entre saldo calculado y datos maestros
El sistema SHALL comparar el saldo pendiente calculado contra el saldo reportado por I-WISP como verificación de integridad de la extracción, y SHALL exponer el resultado de esa comparación al operador.

#### Scenario: Verificación satisfactoria
- **WHEN** ambos saldos coinciden
- **THEN** la extracción se considera consistente

#### Scenario: Verificación con discrepancia
- **WHEN** ambos saldos difieren
- **THEN** el sistema advierte al operador que los datos extraídos podrían estar incompletos, sin bloquear la generación del documento