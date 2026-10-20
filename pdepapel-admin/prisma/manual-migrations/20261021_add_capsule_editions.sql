-- Ediciones de cápsulas sorpresa por papeles (feat/capsulas-p1, 2026-10-21).
-- Una sola migración aditiva para P1–P4: no cambia ni borra nada existente.
-- * `CapsuleBatch.mode` (TRANSFER = el empaque de siempre, sin cambios;
--   RESERVE = una impresión de papeles que aparta con `Product.reservedUnits`)
--   y `CapsuleBatch.editionId`.
-- * Tres tipos de movimiento nuevos, agregados AL FINAL del ENUM (cambio de
--   metadatos; la lista previa es la de producción, comprobada en solo lectura
--   el 2026-10-20).
-- * `CapsuleEdition` (el producto que se vende, banda de costo, tope diario),
--   `CapsuleSlip` (un papel o un regalo: producto real, costo congelado),
--   `CapsuleOrder` (pack, tope del regalo, costo provisional/real, video),
--   `CapsulePackOption` (regalos por pack), `CapsuleDailySlot` (cupos del día
--   de Bogotá; el índice único impide vender de más) y `CapsuleDayCap`
--   (el tope de un día que cambia la dueña).
-- Sin llaves foráneas (relationMode = "prisma"): los índices van a mano.
--
-- Se aplica con el flujo guardado (lo corre Christian):
--   npm run prod:approve -- "Migración cápsulas por papeles (20261021_add_capsule_editions)"
--   npm run prod:migrate -- prisma/manual-migrations/20261021_add_capsule_editions.sql --expect new

-- AlterTable
ALTER TABLE `CapsuleBatch` ADD COLUMN `editionId` VARCHAR(191) NULL,
    ADD COLUMN `mode` ENUM('TRANSFER', 'RESERVE') NOT NULL DEFAULT 'TRANSFER';

-- AlterTable
ALTER TABLE `InventoryMovement` MODIFY `type` ENUM('ORDER_PLACED', 'ORDER_CANCELLED', 'MANUAL_ADJUSTMENT', 'INITIAL_MIGRATION', 'RETURN', 'DAMAGE', 'LOST', 'PROMOTION', 'PURCHASE', 'INITIAL_INTAKE', 'RESTOCK_RECEIVED', 'STORE_USE', 'FESTIVAL_ALLOCATION', 'FESTIVAL_RETURN', 'IN_PERSON_SALE', 'VARIANT_CONVERSION', 'CAPSULE_PACKED', 'CAPSULE_UNPACKED', 'CAPSULE_SLIPS_PRINTED', 'CAPSULE_SLIP_DRAWN', 'CAPSULE_SLIPS_VOIDED') NOT NULL;

-- CreateTable
CREATE TABLE `CapsuleEdition` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `theme` VARCHAR(60) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'PREVIEW', 'LIVE', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `costBandMin` DOUBLE NOT NULL,
    `costBandMax` DOUBLE NOT NULL,
    `dailyOrderCap` INTEGER NOT NULL DEFAULT 5,
    `opensAtLocal` VARCHAR(5) NOT NULL DEFAULT '08:00',
    `createdBy` VARCHAR(191) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CapsuleEdition_productId_key`(`productId`),
    INDEX `CapsuleEdition_storeId_status_idx`(`storeId`, `status`),
    UNIQUE INDEX `CapsuleEdition_storeId_number_key`(`storeId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CapsuleSlip` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `editionId` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `kind` ENUM('SLIP', 'GIFT') NOT NULL DEFAULT 'SLIP',
    `code` VARCHAR(40) NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `status` ENUM('PRINTED', 'DRAWN', 'VOID') NOT NULL DEFAULT 'PRINTED',
    `orderId` VARCHAR(191) NULL,
    `drawnAt` DATETIME(3) NULL,
    `drawnBy` VARCHAR(191) NULL,
    `voidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CapsuleSlip_code_key`(`code`),
    INDEX `CapsuleSlip_storeId_idx`(`storeId`),
    INDEX `CapsuleSlip_editionId_kind_status_idx`(`editionId`, `kind`, `status`),
    INDEX `CapsuleSlip_productId_status_idx`(`productId`, `status`),
    INDEX `CapsuleSlip_batchId_idx`(`batchId`),
    INDEX `CapsuleSlip_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CapsuleOrder` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `editionId` VARCHAR(191) NOT NULL,
    `packSize` INTEGER NOT NULL,
    `giftMaxCost` DOUBLE NOT NULL DEFAULT 0,
    `giftMaxItems` INTEGER NOT NULL DEFAULT 0,
    `provisionalCost` DOUBLE NULL,
    `realCost` DOUBLE NULL,
    `costStatus` ENUM('PROVISIONAL', 'REAL') NOT NULL DEFAULT 'PROVISIONAL',
    `videoConsent` ENUM('NONE', 'PRIVATE', 'PUBLIC_FIRST_NAME') NOT NULL DEFAULT 'NONE',
    `videoStatus` ENUM('POR_ABRIR', 'GRABADO', 'ENVIADO', 'PUBLICADO') NOT NULL DEFAULT 'POR_ABRIR',
    `videoUrl` VARCHAR(500) NULL,
    `suggestedBox` VARCHAR(10) NULL,
    `drawCompletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CapsuleOrder_orderId_key`(`orderId`),
    INDEX `CapsuleOrder_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `CapsuleOrder_editionId_videoStatus_idx`(`editionId`, `videoStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CapsulePackOption` (
    `id` VARCHAR(191) NOT NULL,
    `editionId` VARCHAR(191) NOT NULL,
    `packSize` INTEGER NOT NULL,
    `giftMaxCost` DOUBLE NOT NULL DEFAULT 0,
    `giftMaxItems` INTEGER NOT NULL DEFAULT 0,
    `giftLabel` VARCHAR(120) NULL,

    UNIQUE INDEX `CapsulePackOption_editionId_packSize_key`(`editionId`, `packSize`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CapsuleDailySlot` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `bogotaDate` DATE NOT NULL,
    `slotNumber` INTEGER NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `status` ENUM('HELD', 'CONFIRMED') NOT NULL DEFAULT 'HELD',
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CapsuleDailySlot_orderId_key`(`orderId`),
    INDEX `CapsuleDailySlot_status_expiresAt_idx`(`status`, `expiresAt`),
    UNIQUE INDEX `CapsuleDailySlot_storeId_bogotaDate_slotNumber_key`(`storeId`, `bogotaDate`, `slotNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CapsuleDayCap` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `bogotaDate` DATE NOT NULL,
    `cap` INTEGER NOT NULL,
    `setBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CapsuleDayCap_storeId_bogotaDate_key`(`storeId`, `bogotaDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `CapsuleBatch_editionId_idx` ON `CapsuleBatch`(`editionId`);

