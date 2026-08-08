# Reportes tributarios

El módulo **Reportes tributarios** genera un archivo `.xlsx` con dos hojas:

- **Ventas:** pedidos en estado `PAID` o `SENT` y ventas de Mercado Libre con liquidación neta confirmada. Incluye número de orden, cliente/comprador, canal, valor recibido y fecha. El administrador elige si el período se calcula por **fecha de venta** (fecha de creación del pedido) o por **confirmación de pago** (`paidAt`); las ventas de Mercado Libre se ubican en su fecha real de pago.
- **Compras:** facturas de proveedor registradas manualmente. El número y la fecha de factura son requeridos porque una orden de aprovisionamiento no es un soporte fiscal.

## Puesta en producción

Antes de desplegar código que use este módulo, aplica `prisma/manual-migrations/20260805_add_tax_purchases.sql` a la base de datos de Railway para crear la tabla `TaxPurchase`. El proyecto no mantiene migraciones automáticas de Prisma; este archivo se generó desde el diff entre la base de datos y el esquema y es estrictamente aditivo.

No se deben usar números de órdenes de aprovisionamiento como números de factura. Para el segundo semestre de 2025, registra las facturas históricas de los proveedores, selecciona **Fecha de venta** y descarga el reporte con el período del `2025-07-01` al `2025-12-31`.

Las ventas de Mercado Libre que ya aparecen pagadas, pero todavía no tienen liquidación neta, se muestran como pendientes en el módulo y no se suman al Excel ni a los totales. Cuando Mercado Libre publique sus cargos, envíos e impuestos, el procesamiento seguro calcula el valor recibido y la venta se incorpora automáticamente. El archivo registra ese valor neto operativo; el contador debe confirmar si su declaración requiere informar el valor bruto de venta y los cargos de Mercado Libre por separado.
