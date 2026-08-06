# Reportes tributarios

El módulo **Reportes tributarios** genera un archivo `.xlsx` con dos hojas:

- **Ventas:** pedidos en estado `PAID` o `SENT`, con número de orden, cliente, valor y fecha. El administrador elige si el período se calcula por **fecha de venta** (fecha de creación del pedido) o por **confirmación de pago** (`paidAt`); el Excel identifica la columna elegida.
- **Compras:** facturas de proveedor registradas manualmente. El número y la fecha de factura son requeridos porque una orden de aprovisionamiento no es un soporte fiscal.

## Puesta en producción

Antes de desplegar código que use este módulo, aplica `prisma/manual-migrations/20260805_add_tax_purchases.sql` a la base de datos de Railway para crear la tabla `TaxPurchase`. El proyecto no mantiene migraciones automáticas de Prisma; este archivo se generó desde el diff entre la base de datos y el esquema y es estrictamente aditivo.

No se deben usar números de órdenes de aprovisionamiento como números de factura. Para el segundo semestre de 2025, registra las facturas históricas de los proveedores, selecciona **Fecha de venta** y descarga el reporte con el período del `2025-07-01` al `2025-12-31`.
