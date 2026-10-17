-- Permisos nuevos de `copilot_ro` para la comisión real de Mercado Libre en la
-- habilidad «Precios» (lib/copiloto/skills/precios-tool.ts): de qué producto es
-- cada publicación, su tipo (Clásica / Premium) y su categoría, y el sitio de la
-- conexión. Con eso la herramienta pide la comisión exacta a `listing_prices`.
-- Nada de datos de clientas ni tokens: la conexión solo agrega `siteId`.
-- No hace falta redeploy: MySQL los aplica en la siguiente consulta.
--
-- Se aplica con el flujo guardado (queda en ops/prod-writes.log):
--   npm run prod:approve -- "<motivo>"
--   npm run prod:migrate -- prisma/manual-migrations/20261017_grant_copilot_ro_precios_ml.sql --expect new

GRANT SELECT (`id`, `connectionId`, `status`, `productId`, `listingType`, `categoryId`) ON `railway`.`MarketplaceListing` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `storeId`, `provider`, `status`, `lastSyncedAt`, `siteId`) ON `railway`.`MarketplaceConnection` TO 'copilot_ro'@'%';

-- VERIFICACIÓN (como pdepapel_ro no se ven los permisos de otro usuario): la prueba
-- es el Copiloto preguntando el precio en Mercado Libre de un producto con publicación.
