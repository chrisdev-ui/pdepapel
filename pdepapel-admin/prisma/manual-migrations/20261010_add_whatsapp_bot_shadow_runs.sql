-- Bot de WhatsApp en modo sombra (lib/whatsapp/shadow/): una fila por mensaje
-- escrito con lo que habría mandado el bot nuevo y lo que mandó el real. Solo
-- tipos y conteos; ni texto de clientas, ni búsquedas, ni teléfonos. Tabla
-- nueva y vacía: no toca nada existente. Sin llaves foráneas
-- (relationMode = "prisma").
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WhatsAppBotShadowRun';

-- CreateTable
CREATE TABLE `WhatsAppBotShadowRun` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `inboundMessageId` VARCHAR(191) NOT NULL,
    `intent` VARCHAR(32) NULL,
    `plannedTypes` JSON NOT NULL,
    `plannedCount` INTEGER NOT NULL,
    `productsFound` BOOLEAN NULL,
    `searchRan` BOOLEAN NOT NULL DEFAULT false,
    `realOutcome` VARCHAR(48) NOT NULL,
    `realTypes` JSON NOT NULL,
    `realCount` INTEGER NOT NULL,
    `classifierStatus` VARCHAR(16) NOT NULL,
    `skipReason` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WhatsAppBotShadowRun_inboundMessageId_key`(`inboundMessageId`),
    INDEX `WhatsAppBotShadowRun_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `WhatsAppBotShadowRun_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- VERIFICACIÓN POSTERIOR (debe devolver 1):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WhatsAppBotShadowRun';
-- VUELTA ATRÁS (con el modo sombra apagado en el código): DROP TABLE `WhatsAppBotShadowRun`;
