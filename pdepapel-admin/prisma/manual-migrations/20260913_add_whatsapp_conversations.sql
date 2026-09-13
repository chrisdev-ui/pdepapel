-- Conversaciones de WhatsApp (2026-09-13): historial estructurado de lo que
-- llega por `POST /api/webhook/whatsapp`. Aplicar en Railway ANTES de
-- desplegar el código que lo usa.
--
-- 1. Tablas `Conversation` y `ConversationMessage`.
-- 2. `Order.source` (PANEL | STORE | WHATSAPP), nulo en los pedidos existentes:
--    no se rellena hacia atrás.
-- 3. Una fila de `MarketplaceConnection` para WhatsApp: nunca hubo OAuth para
--    este proveedor, así que el webhook nunca resolvía `connectionId`. El
--    `sellerId` es el WABA que `classifyWhatsAppWebhookEvent` toma de
--    `entry[].id`. Sin tokens: el envío no existe todavía.
--
-- Verificación previa:
--   SELECT COUNT(*) FROM `MarketplaceConnection` WHERE `provider` = 'WHATSAPP'   -- 0
--   SELECT `id` FROM `Store`                                                     -- una sola fila: f23ee5bc-1f6f-4c10-9872-9e6217cc17fd
--   SHOW TABLES LIKE 'Conversation%'                                             -- sin filas
--   SHOW COLUMNS FROM `Order` LIKE 'source'                                      -- sin filas
--
-- Verificación posterior:
--   SHOW TABLES LIKE 'Conversation%'                                             -- Conversation, ConversationMessage
--   SHOW COLUMNS FROM `Order` LIKE 'source'                                      -- enum('PANEL','STORE','WHATSAPP') NULL
--   SELECT `provider`, `sellerId`, `status` FROM `MarketplaceConnection`         -- MERCADOLIBRE (…) y WHATSAPP 1449676032671804 CONNECTED
--   SELECT COUNT(*) FROM `Order` WHERE `source` IS NOT NULL                      -- 0

CREATE TABLE `Conversation` (
  `id`             VARCHAR(191) NOT NULL,
  `storeId`        VARCHAR(191) NOT NULL,
  `channel`        ENUM('WHATSAPP') NOT NULL DEFAULT 'WHATSAPP',
  `phone`          VARCHAR(191) NOT NULL,
  `contactName`    VARCHAR(191) NULL,
  `status`         ENUM('OPEN', 'NEEDS_OWNER', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  `lastInboundAt`  DATETIME(3)  NULL,
  `lastOutboundAt` DATETIME(3)  NULL,
  `orderId`        VARCHAR(191) NULL,
  `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Conversation_storeId_channel_phone_key` (`storeId`, `channel`, `phone`),
  INDEX `Conversation_storeId_status_lastInboundAt_idx` (`storeId`, `status`, `lastInboundAt`),
  INDEX `Conversation_orderId_idx` (`orderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ConversationMessage` (
  `id`             VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `direction`      ENUM('INBOUND', 'OUTBOUND') NOT NULL,
  `externalId`     VARCHAR(191) NULL,
  `body`           TEXT NULL,
  `mediaType`      VARCHAR(191) NULL,
  `mediaUrl`       VARCHAR(191) NULL,
  `sentBy`         ENUM('CUSTOMER', 'OWNER', 'BOT') NOT NULL,
  `status`         ENUM('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED') NOT NULL DEFAULT 'RECEIVED',
  `rawEventId`     VARCHAR(191) NULL,
  `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ConversationMessage_externalId_key` (`externalId`),
  INDEX `ConversationMessage_conversationId_createdAt_idx` (`conversationId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Order`
  ADD COLUMN `source` ENUM('PANEL', 'STORE', 'WHATSAPP') NULL;

INSERT INTO `MarketplaceConnection`
  (`id`, `storeId`, `provider`, `sellerId`, `siteId`, `status`, `tokenVersion`, `createdAt`, `updatedAt`)
VALUES
  ('c0f2b5a4-9a6e-4a3e-8d1b-5f1e2a7c9b01', 'f23ee5bc-1f6f-4c10-9872-9e6217cc17fd', 'WHATSAPP', '1449676032671804', 'WHATSAPP', 'CONNECTED', 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
