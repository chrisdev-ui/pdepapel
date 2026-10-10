-- Visto bueno de Paula a las respuestas de cortesía del bot (gracias,
-- despedida, «¿eres un robot?», «¿qué venden?»).
--
-- Van aparte de `botFacts*` y `botProducts*`: si compartieran versión, publicar
-- estos textos retiraría la aprobación de los datos del negocio o de productos.
-- Las columnas nacen vacías, o sea sin aprobar: hasta que Paula las apruebe en
-- Respuestas, el bot contesta esos mensajes como antes.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('botCasualApprovedAt', 'botCasualApprovedBy',
--                          'botCasualVersion');

ALTER TABLE `StoreSettings`
  ADD COLUMN `botCasualApprovedAt` DATETIME(3)  NULL AFTER `botProductsVersion`,
  ADD COLUMN `botCasualApprovedBy` VARCHAR(191) NULL AFTER `botCasualApprovedAt`,
  ADD COLUMN `botCasualVersion`    VARCHAR(191) NULL AFTER `botCasualApprovedBy`;

-- VERIFICACIÓN POSTERIOR (debe devolver 3):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('botCasualApprovedAt', 'botCasualApprovedBy',
--                          'botCasualVersion');
