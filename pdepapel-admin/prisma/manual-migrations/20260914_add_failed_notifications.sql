-- Avisos que no salieron: registro mínimo y consultable.
--
-- Hasta ahora un fallo de envío solo iba a `console.error` y se perdía en los
-- registros de Vercel, así que nadie podía responder si a una clienta le llegó
-- su confirmación. Esto guarda el fallo; NO hay reintento automático todavía.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FailedNotification';
--
-- Tabla nueva: no toca ninguna fila existente.

CREATE TABLE `FailedNotification` (
  `id`         VARCHAR(191) NOT NULL,
  `storeId`    VARCHAR(191) NULL,
  `channel`    VARCHAR(191) NOT NULL,
  `kind`       VARCHAR(191) NOT NULL,
  `recipient`  VARCHAR(191) NULL,
  `orderId`    VARCHAR(191) NULL,
  `error`      TEXT NOT NULL,
  `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  INDEX `FailedNotification_storeId_createdAt_idx` (`storeId`, `createdAt`),
  INDEX `FailedNotification_orderId_idx` (`orderId`),
  INDEX `FailedNotification_resolvedAt_idx` (`resolvedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- VERIFICACIÓN POSTERIOR (debe devolver 1 y 0):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FailedNotification';
--   SELECT COUNT(*) FROM `FailedNotification`;
