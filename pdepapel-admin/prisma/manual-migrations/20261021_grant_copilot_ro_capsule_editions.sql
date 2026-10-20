-- Permiso nuevo de `copilot_ro` para las ediciones de cápsulas (feat/capsulas-p1, 2026-10-21).
-- Va DESPUÉS de 20261021_add_capsule_editions.sql (la tabla tiene que existir).
-- El Copiloto deja fuera el producto de una edición en «plata quieta» y en
-- productosParaPromocionar (un filtro `capsuleEdition: null` sobre Product):
-- necesita leer qué productos son de una edición. Solo `id`, `storeId`,
-- `productId` y `status`: ni costos ni banda. Nada de datos de clientas.
--
-- Se aplica con el flujo guardado (queda en ops/prod-writes.log):
--   npm run prod:approve -- "<motivo>"
--   npm run prod:migrate -- prisma/manual-migrations/20261021_grant_copilot_ro_capsule_editions.sql --expect new

GRANT SELECT (`id`, `storeId`, `productId`, `status`) ON `railway`.`CapsuleEdition` TO 'copilot_ro'@'%';

-- VERIFICACIÓN (solo lectura): 4 columnas.
-- SELECT COUNT(*) FROM information_schema.COLUMN_PRIVILEGES
--  WHERE GRANTEE = "'copilot_ro'@'%'" AND TABLE_NAME = 'CapsuleEdition';
