-- «Esperando a Paula» y lo que el bot hace mientras tanto (lib/whatsapp/waiting.ts,
-- lib/whatsapp/wait-assist.ts):
--   * StoreSettings: dos interruptores de tres estados (respuesta a los 10 min y
--     mensaje de espera), en SOMBRA por defecto, y los dos textos del mensaje de
--     espera, vacíos (sin texto no sale nada).
--   * Conversation.needsOwnerReason: «owner_window» cuando quedó en NEEDS_OWNER
--     solo por la pausa de 24 h de Paula; así vence con ella.
--   * WhatsAppWaitDecision: una decisión por espera y por tipo (la llave única es
--     el turno y el registro del modo sombra). Nunca guarda texto.
-- Solo agrega columnas y una tabla. Sin llaves foráneas (relationMode = "prisma").
--
-- Se aplica ANTES de desplegar el código: `StoreSettings` se lee completo en
-- cada mensaje del bot y `Conversation` se actualiza sin `select`.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND ((TABLE_NAME = 'StoreSettings' AND COLUMN_NAME IN ('botFallbackMode', 'botHoldingMode', 'botHoldingText', 'botHoldingNightText'))
--        OR (TABLE_NAME = 'Conversation' AND COLUMN_NAME = 'needsOwnerReason'))
--   + (SELECT COUNT(*) FROM information_schema.TABLES
--       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WhatsAppWaitDecision');
--
-- VERIFICACIÓN POSTERIOR (debe devolver 6): la misma consulta.

-- AlterTable
ALTER TABLE `StoreSettings` ADD COLUMN `botFallbackMode` ENUM('OFF', 'SHADOW', 'ON') NOT NULL DEFAULT 'SHADOW',
    ADD COLUMN `botHoldingMode` ENUM('OFF', 'SHADOW', 'ON') NOT NULL DEFAULT 'SHADOW',
    ADD COLUMN `botHoldingNightText` TEXT NULL,
    ADD COLUMN `botHoldingText` TEXT NULL;

-- AlterTable
ALTER TABLE `Conversation` ADD COLUMN `needsOwnerReason` VARCHAR(16) NULL;

-- CreateTable
CREATE TABLE `WhatsAppWaitDecision` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `turnMessageId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `mode` VARCHAR(8) NOT NULL,
    `decision` VARCHAR(16) NOT NULL,
    `reason` VARCHAR(32) NULL,
    `intent` VARCHAR(16) NULL,
    `night` BOOLEAN NOT NULL DEFAULT false,
    `scheduledFor` DATETIME(3) NOT NULL,
    `decidedAt` DATETIME(3) NOT NULL,
    `outcome` VARCHAR(48) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WhatsAppWaitDecision_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `WhatsAppWaitDecision_conversationId_idx`(`conversationId`),
    UNIQUE INDEX `WhatsAppWaitDecision_turnMessageId_kind_key`(`turnMessageId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
