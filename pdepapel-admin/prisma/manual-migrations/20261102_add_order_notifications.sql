-- Avisos de envío y WhatsApp, 2026-10-26 (feat/avisos-envio-2026-10-26). Aditiva: una tabla nueva y columnas que admiten
-- NULL o traen default. Sin datos.
--   * OrderNotification: cada aviso de envío por canal y destinatario; `dedupeKey` único reclama el envío (sale una vez).
--   * Order.whatsapp*: casilla «Recibir avisos de mi pedido por WhatsApp» del checkout, o lo que anotó el panel cuando la
--     clienta lo pidió en el chat (quién y cuándo), y la baja.
--   * StoreSettings.whatsappOrderUpdatesEnabled (apagado) + nombres de las dos plantillas de utilidad aprobadas en Meta.
--   * ShippingWebhookEvent.resolvedBy/resolution/linkedOrderId: guías de EnvioClick sin pedido vinculadas o descartadas.
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre `railway`.* y lee la tabla nueva sin otra línea. `copilot_ro` no recibe
-- nada: tiene permisos por columna en `Order` y las columnas nuevas (consentimiento) no son para el Copiloto.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de esta rama: el código lee estas columnas.
--   npm run prod:approve -- "Avisos de envío y WhatsApp (20261102_add_order_notifications)"
--   npm run prod:migrate -- prisma/manual-migrations/20261102_add_order_notifications.sql --expect new

ALTER TABLE `Order`
  ADD COLUMN `whatsappOptInAt` DATETIME(3) NULL,
  ADD COLUMN `whatsappOptInBy` VARCHAR(191) NULL,
  ADD COLUMN `whatsappOptInSource` ENUM('CHECKOUT', 'PANEL_CHAT') NULL,
  ADD COLUMN `whatsappOptInVersion` VARCHAR(20) NULL,
  ADD COLUMN `whatsappOptOutAt` DATETIME(3) NULL;

ALTER TABLE `StoreSettings`
  ADD COLUMN `whatsappOrderUpdatesEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `whatsappTemplateDelivered` VARCHAR(100) NULL,
  ADD COLUMN `whatsappTemplateGuide` VARCHAR(100) NULL;

ALTER TABLE `ShippingWebhookEvent`
  ADD COLUMN `linkedOrderId` VARCHAR(191) NULL,
  ADD COLUMN `resolution` VARCHAR(20) NULL,
  ADD COLUMN `resolvedBy` VARCHAR(191) NULL;

CREATE INDEX `ShippingWebhookEvent_linkedOrderId_idx` ON `ShippingWebhookEvent`(`linkedOrderId`);

CREATE TABLE `OrderNotification` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `shippingId` VARCHAR(191) NULL,
    `milestone` VARCHAR(40) NOT NULL,
    `channel` ENUM('EMAIL', 'WHATSAPP') NOT NULL,
    `role` VARCHAR(20) NOT NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `status` ENUM('SENT', 'FAILED', 'SKIPPED') NOT NULL,
    `reason` VARCHAR(500) NULL,
    `providerMessageId` VARCHAR(191) NULL,
    `trackingCode` VARCHAR(100) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrderNotification_dedupeKey_key`(`dedupeKey`),
    INDEX `OrderNotification_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `OrderNotification_orderId_createdAt_idx`(`orderId`, `createdAt`),
    INDEX `OrderNotification_shippingId_idx`(`shippingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- VERIFICACIÓN (solo lectura, como pdepapel_ro):
-- SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway'
--   AND ((TABLE_NAME = 'Order' AND COLUMN_NAME LIKE 'whatsappOpt%')
--     OR (TABLE_NAME = 'StoreSettings' AND COLUMN_NAME IN ('whatsappOrderUpdatesEnabled', 'whatsappTemplateGuide', 'whatsappTemplateDelivered'))
--     OR (TABLE_NAME = 'ShippingWebhookEvent' AND COLUMN_NAME IN ('linkedOrderId', 'resolution', 'resolvedBy')));  -- 11
-- SELECT COUNT(*) FROM `OrderNotification`;  -- 0
