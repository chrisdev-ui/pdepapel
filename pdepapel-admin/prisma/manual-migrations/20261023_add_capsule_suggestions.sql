-- Cápsulas, ediciones sugeridas fase 1 (2026-10-23). Aditiva, sin tocar filas:
--   * Store.capsuleMinSlipCost: piso de costo de un papel en las sugerencias (3 000, decisión de Christian; editable en Configuración).
--   * Store.capsuleMinMarginPct: margen mínimo de las cápsulas (sin cifra: lo pone Paula en Configuración).
--   * Product.capsuleLicenseAllowed: Paula permite en las sugerencias un producto que parece de personaje o licencia.
--   * CapsulePackTemplate: plantilla de packs (regalo y caja) cuando aún no hay una edición con packs guardados.
--   * CapsuleSuggestionFeedback: el ✓/✗ de Paula a ediciones y productos sugeridos.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push:
--   npm run prod:approve -- "Ediciones sugeridas de cápsulas (20261023_add_capsule_suggestions)"
--   npm run prod:migrate -- prisma/manual-migrations/20261023_add_capsule_suggestions.sql --expect new

ALTER TABLE `Store` ADD COLUMN `capsuleMinSlipCost` DOUBLE NULL DEFAULT 3000;

ALTER TABLE `Store` ADD COLUMN `capsuleMinMarginPct` DOUBLE NULL;

ALTER TABLE `Product` ADD COLUMN `capsuleLicenseAllowed` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `CapsulePackTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `packSize` INTEGER NOT NULL,
    `giftMaxCost` DOUBLE NOT NULL DEFAULT 0,
    `giftMaxItems` INTEGER NOT NULL DEFAULT 0,
    `giftLabel` VARCHAR(120) NULL,
    `boxReserveCost` DOUBLE NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CapsulePackTemplate_storeId_packSize_key`(`storeId`, `packSize`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CapsuleSuggestionFeedback` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `themeKey` VARCHAR(120) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `decision` ENUM('ACCEPTED', 'REJECTED') NOT NULL,
    `reason` VARCHAR(160) NULL,
    `scoringVersion` VARCHAR(32) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CapsuleSuggestionFeedback_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `CapsuleSuggestionFeedback_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
