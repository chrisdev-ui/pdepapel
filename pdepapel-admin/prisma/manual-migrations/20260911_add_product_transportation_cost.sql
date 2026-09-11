-- Envío y otros gastos por unidad del producto (2026-09).
-- Aplicar en Railway ANTES de desplegar el código que lo usa: el formulario
-- de Productos y la búsqueda de productos leen y escriben la columna, y
-- `checkIfStoreOwner`/`findFirst` sin `select` nombran todas las columnas de
-- Product, así que el código nuevo sobre la tabla vieja falla en la primera
-- consulta. Aditivo: columna nula con valor por defecto 0, filas intactas.
--
-- Hasta ahora el formulario mostraba este gasto (sembrado en 1.000) y lo
-- descartaba al guardar. Con la columna, Productos lo conserva y Mercado
-- Libre lo suma al costo de adquisición para el piso de precio y para el
-- precio sugerido.

ALTER TABLE `Product` ADD COLUMN `transportationCost` DOUBLE NULL DEFAULT 0;

-- Verificación:
-- SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Product' AND COLUMN_NAME = 'transportationCost';
