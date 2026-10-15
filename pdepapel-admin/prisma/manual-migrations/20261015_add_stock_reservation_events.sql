-- Reservas v2, fase 2: historial de cada reserva (quién agregó, cambió,
-- quitó, extendió, convirtió o cerró, y cuándo). Solo conteos e ids; los
-- datos de la clienta no se copian. Sin llaves foráneas (relationMode =
-- "prisma").
--
-- Compatible con el código desplegado: es una tabla nueva que nadie lee
-- todavía. Se aplica ANTES del push.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StockReservationEvent';
--
-- VERIFICACIÓN POSTERIOR (debe devolver 1): la misma consulta.

-- CreateTable
CREATE TABLE `StockReservationEvent` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `reservationId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `quantity` INTEGER NULL,
    `previousQuantity` INTEGER NULL,
    `actor` VARCHAR(191) NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockReservationEvent_reservationId_createdAt_idx`(`reservationId`, `createdAt`),
    INDEX `StockReservationEvent_storeId_createdAt_idx`(`storeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
