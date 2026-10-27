-- Comandos por WhatsApp C1, 2026-10-27 (feat/comandos-whatsapp-c1). Aditiva: dos columnas nulas y una tabla nueva. Sin datos.
--   * MarketplaceConnection.selfPhone / selfBsuid: el número del propio negocio y su BSUID, que el webhook aprende de las
--     entregas firmadas. Con ellos el chat de Paula consigo misma sale de Conversaciones, «Clientas esperando» y métricas
--     sin tocar la conversación que ya existe.
--   * WhatsAppAdminCommand: la bitácora de comandos («/ayuda», «/estado <pedido>»). Sin texto, teléfono ni nombre de
--     clientas; el argumento es como mucho un número de pedido.
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre `railway`.* y lee la tabla nueva sin otra línea. `copilot_ro` no recibe
-- nada: el Copiloto no lee comandos.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de esta rama: el código lee estas columnas.
--   npm run prod:approve -- "Comandos por WhatsApp C1 (20261105_add_whatsapp_admin_commands)"
--   npm run prod:migrate -- prisma/manual-migrations/20261105_add_whatsapp_admin_commands.sql --expect new

ALTER TABLE `MarketplaceConnection`
    ADD COLUMN `selfPhone` VARCHAR(32) NULL,
    ADD COLUMN `selfBsuid` VARCHAR(64) NULL;

CREATE TABLE `WhatsAppAdminCommand` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `echoId` VARCHAR(191) NOT NULL,
    `command` VARCHAR(32) NOT NULL,
    `args` VARCHAR(64) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'RECEIVED',
    `outcome` VARCHAR(32) NULL,
    `reply` TEXT NULL,
    `orderId` VARCHAR(191) NULL,
    `delivered` INTEGER NOT NULL DEFAULT 0,
    `sentAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `doneAt` DATETIME(3) NULL,

    UNIQUE INDEX `WhatsAppAdminCommand_echoId_key`(`echoId`),
    INDEX `WhatsAppAdminCommand_storeId_createdAt_idx`(`storeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- VERIFICACIÓN (solo lectura, como pdepapel_ro):
-- SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway'
--   AND TABLE_NAME = 'MarketplaceConnection' AND COLUMN_NAME IN ('selfPhone', 'selfBsuid');  -- 2
-- SELECT COUNT(*) FROM `WhatsAppAdminCommand`;  -- 0
