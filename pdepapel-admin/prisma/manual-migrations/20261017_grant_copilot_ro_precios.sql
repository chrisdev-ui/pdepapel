-- Permisos nuevos de `copilot_ro` para la habilidad «Precios» del Copiloto
-- (lib/copiloto/skills/precios-*.ts). Va DESPUÉS de 20261017_add_pricing_settings.sql
-- (las columnas tienen que existir). Lo aplica Christian con el flujo guardado,
-- nunca desde la consola de Railway ni Claude:
--   npm run prod:approve -- "<motivo>"
--   npm run prod:migrate -- prisma/manual-migrations/20261017_grant_copilot_ro_precios.sql --expect new
-- No hace falta redeploy: MySQL los aplica en la siguiente consulta.
-- Product y Category ya se leen completos (20261010); Shipping.cost, Order y
-- PaymentDetails ya alcanzan para el envío típico. Nada de datos de clientas.

-- Margen mínimo de la tienda, umbral de envío gratis y ajustes de Mercado Libre.
GRANT SELECT (`freeShippingThreshold`, `storeMinMarginPercent`, `mercadoLibreTargetMarginPercent`, `mercadoLibreMinNetPerUnit`, `mercadoLibreLowPriceFixedFee`, `mercadoLibreFreeShippingMin`) ON `railway`.`Store` TO 'copilot_ro'@'%';

-- VERIFICACIÓN (solo lectura): deben salir 8 columnas de Store (las 6 nuevas más `id` y `lowStockThreshold`).
-- SELECT COLUMN_NAME FROM information_schema.COLUMN_PRIVILEGES
--  WHERE GRANTEE = "'copilot_ro'@'%'" AND TABLE_NAME = 'Store';
