-- Búsquedas guardadas por clienta (2026-09).
-- Aplicar en Railway justo antes de desplegar el código que lo usa. Aditivo.

CREATE TABLE `CustomerSavedSearch` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(128) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `query` VARCHAR(1000) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `CustomerSavedSearch_storeId_userId_createdAt_idx` (`storeId`, `userId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verificación:
-- SELECT COUNT(*) FROM CustomerSavedSearch;
