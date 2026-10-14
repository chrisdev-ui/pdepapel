-- Apartados (lote 1): unidades guardadas para una clienta sin venderlas.
-- `Product.reservedUnits` cuenta lo apartado; lo disponible para vender es
-- `stock - reservedUnits` (lib/available-stock.ts). El stock físico y el
-- kardex no cambian. `StockReservation` guarda cada apartado (sin pantallas
-- todavía: llegan en el lote 2). `Store.reservationDefaultDays` es la
-- duración por defecto. Todo nace en cero o vacío, así que nada cambia para
-- la tienda hasta que exista el primer apartado. Sin llaves foráneas
-- (relationMode = "prisma").
--
-- Se aplica ANTES de desplegar el código: `reservedUnits` se lee en el
-- catálogo, el checkout, el punto de venta y Mercado Libre.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT
--     (SELECT COUNT(*) FROM information_schema.COLUMNS
--       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Product' AND COLUMN_NAME = 'reservedUnits')
--   + (SELECT COUNT(*) FROM information_schema.COLUMNS
--       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Store' AND COLUMN_NAME = 'reservationDefaultDays')
--   + (SELECT COUNT(*) FROM information_schema.TABLES
--       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StockReservation');
--
-- VERIFICACIÓN POSTERIOR (debe devolver 3): la misma consulta. Y debe devolver 0:
--   SELECT COUNT(*) FROM `Product` WHERE `reservedUnits` <> 0;

-- AlterTable
ALTER TABLE `Store` ADD COLUMN `reservationDefaultDays` INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `reservedUnits` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `StockReservation` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerPhone` VARCHAR(191) NOT NULL DEFAULT '',
    `note` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `status` ENUM('ACTIVE', 'CONVERTED', 'CONSUMED', 'RELEASED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `orderId` VARCHAR(191) NULL,
    `unbackedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,
    `closedBy` VARCHAR(191) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StockReservation_storeId_status_expiresAt_idx`(`storeId`, `status`, `expiresAt`),
    INDEX `StockReservation_productId_status_idx`(`productId`, `status`),
    INDEX `StockReservation_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
