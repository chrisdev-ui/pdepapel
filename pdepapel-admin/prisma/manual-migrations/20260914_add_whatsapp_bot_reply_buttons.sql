-- Botones y aprobación en las respuestas automáticas de WhatsApp.
--
-- Para qué: permitir menús («Ver horarios» / «Envíos» / «Hablar con Paula»)
-- y exigir que un menú lo apruebe Paula antes de que el bot lo mande.
--
-- Seguro de repetir: las tres columnas son nuevas y aceptan NULL, así que las
-- respuestas que ya existen siguen funcionando igual (sin botones, sin
-- aprobación pendiente, porque la aprobación solo se exige a las que traen
-- botones).
--
-- VERIFICACIÓN PREVIA (debe devolver 0 filas):
--   SELECT COLUMN_NAME FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME = 'WhatsAppBotReply'
--      AND COLUMN_NAME IN ('buttons', 'approvedAt', 'approvedBy');

ALTER TABLE `WhatsAppBotReply`
  ADD COLUMN `buttons` JSON NULL,
  ADD COLUMN `approvedAt` DATETIME(3) NULL,
  ADD COLUMN `approvedBy` VARCHAR(191) NULL;

-- VERIFICACIÓN POSTERIOR (debe devolver exactamente 3 filas):
--   SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME = 'WhatsAppBotReply'
--      AND COLUMN_NAME IN ('buttons', 'approvedAt', 'approvedBy');
--
-- Y que nada se haya roto (debe seguir devolviendo el mismo número que antes):
--   SELECT COUNT(*) FROM `WhatsAppBotReply`;
--
-- NOTA: `prisma migrate diff` también reporta tres renombrados de índice en
-- `ProductNamingChange`. Son deriva vieja de nombres, no tienen que ver con
-- este cambio y NO se tocan aquí.
