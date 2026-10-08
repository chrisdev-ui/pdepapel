-- Objetivos de precio de Mercado Libre por tienda (#18): margen neto objetivo
-- (% del precio) y ganancia neta mínima por unidad (COP). El asistente de
-- publicación sugiere el menor precio «…900» cuyo neto por unidad cumple el
-- mayor de los dos.
--
-- Aditiva: dos columnas NOT NULL con valor por defecto; MySQL rellena las
-- filas existentes con 20 y 10000. No cambia precios de publicaciones vivas.
--
-- APLICAR ANTES DEL DEPLOY: el código nuevo lee estas columnas en Configuración
-- y en Mercado Libre.
--
--   npm run prod:migrate -- prisma/manual-migrations/20261008_add_store_mercadolibre_pricing_targets.sql --expect new

ALTER TABLE `Store`
  ADD COLUMN `mercadoLibreTargetMarginPercent` DOUBLE NOT NULL DEFAULT 20,
  ADD COLUMN `mercadoLibreMinNetPerUnit` INTEGER NOT NULL DEFAULT 10000;

-- Verificación:
--   SHOW COLUMNS FROM `Store` WHERE Field IN ('mercadoLibreTargetMarginPercent', 'mercadoLibreMinNetPerUnit');
--   SELECT `mercadoLibreTargetMarginPercent`, `mercadoLibreMinNetPerUnit` FROM `Store`;  → 20, 10000
-- Reversión (después de revertir el código):
--   ALTER TABLE `Store` DROP COLUMN `mercadoLibreTargetMarginPercent`, DROP COLUMN `mercadoLibreMinNetPerUnit`;
