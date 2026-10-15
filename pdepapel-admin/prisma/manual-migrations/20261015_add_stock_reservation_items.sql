-- Reservas v2, expansión: una reserva puede guardar varios productos.
-- `StockReservationItem` es un producto dentro de una reserva (cantidad,
-- «sin respaldo» propio, quién lo agregó). El encabezado conserva
-- `productId` y `quantity`, ahora opcionales, mientras dura la transición: el
-- código de esta fase los sigue llenando y además escribe el ítem. La
-- contracción (borrar esas dos columnas) es un lote posterior. Sin llaves
-- foráneas (relationMode = "prisma").
--
-- Compatible con el código desplegado: nadie lee la tabla nueva todavía y las
-- columnas solo dejan de ser obligatorias. Se aplica ANTES del push.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT
--     (SELECT COUNT(*) FROM information_schema.TABLES
--       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StockReservationItem')
--   + (SELECT COUNT(*) FROM information_schema.COLUMNS
--       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StockReservation'
--         AND COLUMN_NAME IN ('productId', 'quantity') AND IS_NULLABLE = 'YES');
--
-- VERIFICACIÓN POSTERIOR (debe devolver 3): la misma consulta.

-- AlterTable
ALTER TABLE `StockReservation` MODIFY `productId` VARCHAR(191) NULL,
    MODIFY `quantity` INTEGER NULL;

-- CreateTable
CREATE TABLE `StockReservationItem` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `reservationId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unbackedAt` DATETIME(3) NULL,
    `addedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StockReservationItem_productId_idx`(`productId`),
    INDEX `StockReservationItem_storeId_createdAt_idx`(`storeId`, `createdAt`),
    UNIQUE INDEX `StockReservationItem_reservationId_productId_key`(`reservationId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
