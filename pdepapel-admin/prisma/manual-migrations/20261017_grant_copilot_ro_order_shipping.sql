-- Permiso nuevo de `copilot_ro` para que «resumenFinancieroMes» y «compararMeses»
-- digan cuántos pedidos tienen el envío no registrado en su costo
-- (lib/copiloto/tools.ts › monthSummary). Va DESPUÉS de
-- 20261017_add_order_product_shipping.sql (las columnas tienen que existir).
-- Montos y una marca por pedido: nada de datos de clientas.
-- No hace falta redeploy: MySQL lo aplica en la siguiente consulta.
--
-- Se aplica con el flujo guardado (queda en ops/prod-writes.log):
--   npm run prod:approve -- "<motivo>"
--   npm run prod:migrate -- prisma/manual-migrations/20261017_grant_copilot_ro_order_shipping.sql --expect new

GRANT SELECT (`productShippingCost`, `productShippingMissing`) ON `railway`.`Order` TO 'copilot_ro'@'%';

-- VERIFICACIÓN (solo lectura, como root o el dueño de los permisos):
-- SELECT COLUMN_NAME FROM information_schema.COLUMN_PRIVILEGES
--  WHERE GRANTEE = "'copilot_ro'@'%'" AND TABLE_NAME = 'Order' AND COLUMN_NAME LIKE 'productShipping%';
