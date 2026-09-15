-- Visto bueno aparte para lo que el bot contesta sobre productos.
--
-- Por qué no reutiliza `botFacts*`: esas tres columnas guardan la versión de
-- los textos aprobados, y la aprobación se cae sola cuando la versión cambia.
-- Si los dos lotes compartieran una sola versión, publicar las respuestas de
-- productos cambiaría la huella y retiraría —sin que nadie lo pida— el visto
-- bueno que Paula ya le haya dado a los datos del negocio, dejando al bot mudo
-- en preguntas que ya funcionaban. Con columnas propias cada grupo se aprueba,
-- se retira y se invalida por su cuenta.
--
-- VERIFICACIÓN PREVIA (debe devolver 0 y 1):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('botProductsApprovedAt', 'botProductsApprovedBy',
--                          'botProductsVersion');
--   SELECT COUNT(*) FROM `StoreSettings`;

ALTER TABLE `StoreSettings`
  ADD COLUMN `botProductsApprovedAt` DATETIME(3)  NULL AFTER `botFactsVersion`,
  ADD COLUMN `botProductsApprovedBy` VARCHAR(191) NULL AFTER `botProductsApprovedAt`,
  ADD COLUMN `botProductsVersion`    VARCHAR(64)  NULL AFTER `botProductsApprovedBy`;

-- Columnas nuevas, opcionales y sin relleno: nacen en NULL, que significa «sin
-- aprobar», que es justo donde tienen que empezar. No tocan ninguna fila.
--
-- VERIFICACIÓN POSTERIOR (debe devolver 3, y 1 fila con las tres en NULL):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('botProductsApprovedAt', 'botProductsApprovedBy',
--                          'botProductsVersion');
--   SELECT COUNT(*) FROM `StoreSettings` WHERE `botProductsApprovedAt` IS NULL
--     AND `botProductsApprovedBy` IS NULL AND `botProductsVersion` IS NULL;
