-- Respuestas automáticas de WhatsApp editables desde el panel (2026-09-14).
--
-- Hasta ahora las palabras clave vivían en un arreglo de TypeScript
-- (`lib/whatsapp/bot-keywords.ts`), que quedó vacío a propósito porque una
-- respuesta de ejemplo le llegaría tal cual a una clienta. Esta tabla las
-- saca del código para que la dueña las escriba desde Conversaciones.
--
-- La tabla nace vacía: el bot sigue sin contestar nada hasta que ella cree la
-- primera respuesta, que es el mismo comportamiento de hoy.
--
-- Verificación previa:
--   SHOW TABLES LIKE 'WhatsAppBotReply'            -- sin filas
--
-- Verificación posterior:
--   SHOW TABLES LIKE 'WhatsAppBotReply'            -- una fila
--   SELECT COUNT(*) FROM `WhatsAppBotReply`        -- 0
--   SHOW INDEX FROM `WhatsAppBotReply`             -- PRIMARY + storeId_isActive_sortOrder

CREATE TABLE `WhatsAppBotReply` (
  `id`        VARCHAR(191) NOT NULL,
  `storeId`   VARCHAR(191) NOT NULL,
  `label`     VARCHAR(191) NOT NULL,
  `triggers`  JSON NOT NULL,
  `answer`    TEXT NOT NULL,
  `isActive`  BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `WhatsAppBotReply_storeId_isActive_sortOrder_idx` (`storeId`, `isActive`, `sortOrder`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
