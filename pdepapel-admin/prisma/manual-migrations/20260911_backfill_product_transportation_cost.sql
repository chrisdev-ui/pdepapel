-- Relleno del gasto de envío y otros por unidad (2026-09).
-- Hasta la columna `transportationCost` el formulario de Productos sembraba
-- este gasto en 1.000 y lo usaba en el precio sugerido, pero no lo guardaba.
-- Al crear la columna con valor 0, todos los productos existentes quedaron en
-- 0 y su precio sugerido y el piso de Mercado Libre bajaron 1.000. Este
-- relleno restaura el valor que el negocio venía usando; solo toca filas en
-- 0 o NULL, así que un producto ya editado con otro valor no se modifica.
-- Idempotente: una segunda ejecución no cambia nada.

UPDATE `Product`
SET `transportationCost` = 1000
WHERE `transportationCost` = 0 OR `transportationCost` IS NULL;

-- Verificación:
-- SELECT COUNT(*) AS total,
--        SUM(`transportationCost` = 1000) AS en_mil,
--        SUM(`transportationCost` = 0 OR `transportationCost` IS NULL) AS en_cero
--   FROM `Product`;
