-- Finanzas de pedidos con el envío por unidad de los productos (decisión de
-- Christian del 2026-10-17). Desde el despliegue, el costo de producto de un
-- pedido pagado (`totalProductCost`) suma compra + envío por unidad cuando el
-- envío es conocido; estas dos columnas dicen cuánto fue el envío y si a alguna
-- línea le faltaba. Los pedidos anteriores no se reescriben: quedan en NULL,
-- que significa «costo solo de compra».
-- Columnas nuevas, opcionales y sin valor por defecto: en MySQL 8 es
-- instantáneo (ALGORITHM=INSTANT) y no cambia ninguna fila.
--
-- Se aplica con el flujo guardado ANTES del push (el código nuevo escribe estas columnas):
--   npm run prod:approve -- "<motivo>"
--   npm run prod:migrate -- prisma/manual-migrations/20261017_add_order_product_shipping.sql --expect new
--
-- VERIFICACIÓN (solo lectura): SHOW COLUMNS FROM `Order` LIKE 'productShipping%';
-- dos filas, Null = YES, Default = NULL.

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `productShippingCost` DOUBLE NULL, ADD COLUMN `productShippingMissing` BOOLEAN NULL;
