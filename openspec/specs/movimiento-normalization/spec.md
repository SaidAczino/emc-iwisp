## Purpose
Define cómo el sistema convierte las filas crudas extraídas del portal I-WISP en movimientos normalizados: modelo de datos, determinación del tipo, formato numérico de importes, interpretación de fechas y validación de integridad de la extracción.

## Requirements

### Requirement: Modelo normalizado de movimiento
El sistema SHALL convertir cada fila cruda del portal en un movimiento normalizado con los campos: tipo (`factura` o `cobranza`), número, referencia de cobranza, detalle, importe como valor numérico, fecha como valor con zona horaria interpretable y balance reportado por el portal.

El campo `detalle` SHALL copiarse literalmente, sin interpretarlo ni inferir el periodo facturado a partir de la fecha.

#### Scenario: Movimiento de tipo factura
- **WHEN** la fila del portal corresponde a una factura
- **THEN** el movimiento se normaliza con tipo `factura`, y el detalle se conserva exactamente como lo expone el portal

#### Scenario: Movimiento de tipo cobranza
- **WHEN** la fila del portal corresponde a un cobro
- **THEN** el movimiento se normaliza con tipo `cobranza`, y el detalle se conserva exactamente como lo expone el portal

#### Scenario: Detalle con periodo y fecha discrepantes
- **WHEN** el detalle indica un mes que no corresponde al mes de la fecha del movimiento
- **THEN** el detalle se mantiene literal sin corrección ni anotación

### Requirement: Determinación del tipo por atributo semántico
El sistema SHALL determinar el tipo de cada movimiento exclusivamente a partir del atributo `title` del elemento de fila (`Cobranza` o `Factura`), y SHALL NOT inferirlo a partir de atributos de estilo visual ni del texto de la celda.

#### Scenario: Fila con estilo no estándar
- **WHEN** una fila tiene el atributo `title="Factura"` pero estilos distintos a los habituales
- **THEN** el sistema la clasifica como factura

### Requirement: Formato numérico e importes
El sistema SHALL convertir el importe a valor numérico eliminando el símbolo de moneda, los espacios y los separadores de miles, y SHALL tratar el valor obtenido como magnitud absoluta asociada a un tipo, sin asumir signo.

#### Scenario: Importe con separador de miles
- **WHEN** el importe aparece con separador de miles
- **THEN** el sistema lo interpreta correctamente como un único valor numérico

#### Scenario: Referencia de cobranza vacía
- **WHEN** la referencia de cobranza es un guion o está vacía
- **THEN** el sistema la representa como valor vacío, no como el texto del guion

### Requirement: Interpretación de fechas
El sistema SHALL interpretar las fechas del portal usando el formato `dd/mm/aaaa hh:mm:ss` que el portal emite, y SHALL NO aplicar interpretación por formato de fecha ISO.

#### Scenario: Fecha de día ambiguo
- **WHEN** el día y el mes de una fecha son ambos menores o iguales a 12
- **THEN** el sistema interpreta el día primero y el mes después, conforme al formato `dd/mm/aaaa` del portal

### Requirement: Validación de integridad de la extracción
El sistema SHALL validar que la extracción produjo movimientos y que la estructura de la fuente es la esperada, y SHALL fallar de forma explícita ante una extracción vacía o con estructura inesperada.

#### Scenario: Extracción sin filas de movimiento
- **WHEN** la fuente no contiene ninguna fila de movimiento reconocible
- **THEN** el sistema falla con un error explícito de extracción

#### Scenario: Filas sin el atributo de tipo
- **WHEN** las filas encontradas carecen del atributo `title` que identifica su tipo
- **THEN** el sistema falla con un error explícito de estructura no reconocida

#### Scenario: Cambio de número de columnas
- **WHEN** las filas de la tabla presentan una cantidad de celdas distinta a la esperada
- **THEN** el sistema falla con un error explícito en lugar de producir movimientos mal mapeados
