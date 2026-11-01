-- Banner de preventa en la portada (2026-11-01). Aditiva:
--   * HomeCampaignType += PRESALE: campaña de un solo producto en preventa. Precio, anticipo y abono mínimo los
--     arma el panel desde la preventa activa y la regla del checkout; la campaña se oculta sola si la preventa
--     se cierra o el producto se archiva.
--   * HomeContent.mobileImageUrl: foto opcional para el teléfono (sin ella se usa imageUrl).
--   * HomeContent.promotionId: promotion_id de GA4 (view_promotion / select_promotion); sin él, el id.
--
-- Orden: se aplica ANTES del push. El cliente de Prisma nuevo lee estas columnas en toda lectura de HomeContent
-- sin `select`; sin la migración, la portada y el panel de Contenido fallan. El código vivo no las usa, así que
-- aplicarla antes no cambia nada.
--
-- Permisos: `pdepapel_ro` y `copilot_ro` tienen SELECT sobre la tabla entera y ven lo nuevo sin otra línea.
--
-- Lo corre Christian:
--   npm run prod:approve -- "Banner de preventa en la portada (20261112_add_home_content_presale_campaign)"
--   npm run prod:migrate -- prisma/manual-migrations/20261112_add_home_content_presale_campaign.sql --expect new

ALTER TABLE `HomeContent`
    MODIFY COLUMN `campaignType` ENUM('SEASON', 'SHIPMENT', 'COLLECTION', 'OFFER', 'PRESALE') NULL,
    ADD COLUMN `mobileImageUrl` VARCHAR(500) NULL,
    ADD COLUMN `promotionId` VARCHAR(80) NULL;
