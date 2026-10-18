-- Permisos nuevos de `copilot_ro` para las marcas (feat/marcas, 2026-10-17).
-- Va DESPUÉS de 20261017_add_brands.sql (la tabla y las columnas tienen que
-- existir). `Product` y `OrderItem` ya tienen permiso de tabla completa, así
-- que `Product.brandId` y `OrderItem.brandName` se leen sin otra línea; aquí
-- van la tabla `Brand` (sin URLs ni datos internos de la fuente del logo) y
-- `ProductGroup.brandId`, que tiene permisos por columna.
-- Nada de datos de clientas. No hace falta redeploy: MySQL lo aplica en la
-- siguiente consulta.
--
-- Se aplica con el flujo guardado (queda en ops/prod-writes.log):
--   npm run prod:approve -- "<motivo>"
--   npm run prod:migrate -- prisma/manual-migrations/20261017_grant_copilot_ro_brands.sql --expect new

GRANT SELECT (`id`, `storeId`, `name`, `slug`, `aliases`, `manufacturerName`, `logoPermission`, `isVisible`, `isFeatured`, `sortOrder`, `isArchived`, `parentBrandId`) ON `railway`.`Brand` TO 'copilot_ro'@'%';
GRANT SELECT (`brandId`) ON `railway`.`ProductGroup` TO 'copilot_ro'@'%';

-- VERIFICACIÓN (solo lectura, como root o el dueño de los permisos): 12 columnas de Brand y 1 de ProductGroup.
-- SELECT TABLE_NAME, COUNT(*) FROM information_schema.COLUMN_PRIVILEGES
--  WHERE GRANTEE = "'copilot_ro'@'%'" AND (TABLE_NAME = 'Brand' OR (TABLE_NAME = 'ProductGroup' AND COLUMN_NAME = 'brandId'))
--  GROUP BY TABLE_NAME;
