-- Comandos por WhatsApp C2, 2026-10-27 (feat/comandos-whatsapp-c2). Aditiva: columnas nulas o con default y un índice. Sin datos.
--   * Order.draftAgreedAmount / draftOrigin: el borrador creado con «/pedido» o con «Crear pedido» en Conversaciones guarda
--     el valor acordado por chat y de dónde salió. Null en todos los pedidos existentes.
--   * WhatsAppAdminCommand.codeHash / codeExpiresAt / codeAttempts / quote: la confirmación de «/guia» (sha256 del código
--     de 4 cifras con el id de la fila, vencimiento a 10 min, intentos fallidos y la tarifa cotizada). Nunca el código.
--   * Índice (storeId, command, status) para buscar las «/guia» que esperan confirmación.
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre `railway`.* y ve las columnas nuevas sin otra línea. `copilot_ro` no recibe
-- nada: sus permisos son por tabla y por columna, y el Copiloto no necesita estas.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de esta rama: el panel lee estas columnas.
--   npm run prod:approve -- "Comandos por WhatsApp C2 (20261106_add_whatsapp_drafts_and_guide_codes)"
--   npm run prod:migrate -- prisma/manual-migrations/20261106_add_whatsapp_drafts_and_guide_codes.sql --expect new

ALTER TABLE `Order`
    ADD COLUMN `draftAgreedAmount` INTEGER NULL,
    ADD COLUMN `draftOrigin` VARCHAR(24) NULL;

ALTER TABLE `WhatsAppAdminCommand`
    ADD COLUMN `codeHash` VARCHAR(64) NULL,
    ADD COLUMN `codeExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `codeAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `quote` JSON NULL;

CREATE INDEX `WhatsAppAdminCommand_storeId_command_status_idx` ON `WhatsAppAdminCommand`(`storeId`, `command`, `status`);

-- VERIFICACIÓN (solo lectura, como pdepapel_ro):
-- SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway'
--   AND ((TABLE_NAME = 'Order' AND COLUMN_NAME IN ('draftAgreedAmount', 'draftOrigin'))
--     OR (TABLE_NAME = 'WhatsAppAdminCommand' AND COLUMN_NAME IN ('codeHash', 'codeExpiresAt', 'codeAttempts', 'quote')));  -- 6
-- SELECT COUNT(*) FROM `Order` WHERE draftOrigin IS NOT NULL;  -- 0
