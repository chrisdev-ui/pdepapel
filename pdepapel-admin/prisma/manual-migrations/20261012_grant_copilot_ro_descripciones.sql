-- Permisos nuevos de `copilot_ro` para la herramienta «productoParaDescripcion»
-- (habilidad «descripciones», lib/copiloto/skills/). El usuario ya existe en
-- producción: este archivo solo agrega nueve GRANT de lectura, columna por
-- columna. Lo corre Christian en la consola de MySQL de Railway, con su
-- usuario administrador; no pasa por `prod:migrate` ni por Claude.
--
-- Sin estos permisos la herramienta igual responde con el nombre, la
-- categoría, la marca y la descripción actual del producto, y avisa que el
-- color, la talla, el diseño, el grupo y el kit no están disponibles todavía.
-- No hace falta redeploy: MySQL los aplica en la siguiente consulta.
-- Nada de costos, precios de compra ni datos de clientas.

-- Nombres de la línea de producto y de los atributos.
GRANT SELECT (`id`, `name`) ON `railway`.`Type` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `name`) ON `railway`.`Color` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `name`) ON `railway`.`Size` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `name`) ON `railway`.`Design` TO 'copilot_ro'@'%';

-- Grupo de variantes: la descripción base y la marca del grupo.
GRANT SELECT (`id`, `storeId`, `name`, `description`, `brand`) ON `railway`.`ProductGroup` TO 'copilot_ro'@'%';

-- Opciones de catálogo del producto (p. ej. tipo de punta, gramaje).
GRANT SELECT (`id`, `name`) ON `railway`.`CatalogOption` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `optionId`, `name`) ON `railway`.`CatalogOptionValue` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `productId`, `optionId`, `optionValueId`) ON `railway`.`ProductCatalogOptionValue` TO 'copilot_ro'@'%';

-- Qué trae un kit.
GRANT SELECT (`id`, `kitId`, `componentId`, `quantity`) ON `railway`.`ProductKit` TO 'copilot_ro'@'%';

-- VERIFICACIÓN (solo lectura; deben salir 9 tablas y 26 columnas en total):
--   SELECT TABLE_NAME, COUNT(*) AS columnas
--   FROM information_schema.COLUMN_PRIVILEGES
--   WHERE GRANTEE = "'copilot_ro'@'%'"
--     AND TABLE_NAME IN ('Type', 'Color', 'Size', 'Design', 'ProductGroup', 'CatalogOption', 'CatalogOptionValue', 'ProductCatalogOptionValue', 'ProductKit')
--   GROUP BY TABLE_NAME ORDER BY TABLE_NAME;
-- VUELTA ATRÁS: las mismas nueve líneas con REVOKE SELECT (...) ON ... FROM 'copilot_ro'@'%';
