-- 20260910_add_store_low_stock_threshold
--
-- Hace configurable por tienda el umbral de "stock crítico".
--
-- Hasta ahora el umbral vivía en dos lugares distintos y ninguno se podía
-- cambiar sin desplegar: la constante `TRESHOLD_LOW_STOCK = 5`
-- (constants/index.ts) y un parámetro por defecto `lowStockThreshold = 5`
-- en `lib/product-readiness.ts`.
--
-- La columna es NULLABLE a propósito: `NULL` significa "usa el valor por
-- defecto de la aplicación (5)", igual que `freeShippingThreshold`. Por eso no
-- hace falta rellenar las filas existentes y la migración es segura de aplicar
-- con la aplicación en marcha: el código anterior ignora la columna y el nuevo
-- la lee con fallback.
--
-- Reversible: DROP COLUMN.

ALTER TABLE `Store`
  ADD COLUMN `lowStockThreshold` INT NULL;

-- Rollback:
-- ALTER TABLE `Store` DROP COLUMN `lowStockThreshold`;
