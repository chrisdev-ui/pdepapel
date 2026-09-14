-- Preventa: vender un producto antes de tenerlo en bodega.
--
-- NO APLICADA TODAVÍA. Christian pidió dejar esto como diff revisable.
--
-- Qué añade:
--   * tabla `ProductPresale` (una campaña por producto y por vez);
--   * `OrderItem.isPreorder`, `preorderReleasedAt`, `presaleId`.
--
-- Nada toca `Product.stock`: las unidades prometidas viven en
-- `ProductPresale.committedUnits` y solo se miran en la pantalla de Preventas.
-- Inventario, «Por reponer» y el kardex siguen leyendo únicamente el stock real.
--
-- Seguro de repetir: la tabla es nueva y las tres columnas aceptan NULL o traen
-- valor por defecto, así que los pedidos que ya existen quedan como están
-- (`isPreorder = false`) y siguen despachándose igual.
--
-- VERIFICACIÓN PREVIA (las dos deben devolver 0):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ProductPresale';
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'OrderItem'
--      AND COLUMN_NAME IN ('isPreorder','preorderReleasedAt','presaleId');

CREATE TABLE `ProductPresale` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'RELEASED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `expectedArrivalAt` DATETIME(3) NOT NULL,
    `unitLimit` INTEGER NOT NULL,
    `committedUnits` INTEGER NOT NULL DEFAULT 0,
    `releasedAt` DATETIME(3) NULL,
    `releasedBy` VARCHAR(191) NULL,
    `delayNotifiedAt` DATETIME(3) NULL,
    `delayNotifiedBy` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `ProductPresale_storeId_status_expectedArrivalAt_idx`(`storeId`, `status`, `expectedArrivalAt`),
    INDEX `ProductPresale_productId_status_idx`(`productId`, `status`),
    INDEX `ProductPresale_storeId_productId_idx`(`storeId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OrderItem`
  ADD COLUMN `isPreorder` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `preorderReleasedAt` DATETIME(3) NULL,
  ADD COLUMN `presaleId` VARCHAR(191) NULL;

CREATE INDEX `OrderItem_orderId_isPreorder_preorderReleasedAt_idx`
  ON `OrderItem`(`orderId`, `isPreorder`, `preorderReleasedAt`);
CREATE INDEX `OrderItem_presaleId_idx` ON `OrderItem`(`presaleId`);

-- VERIFICACIÓN POSTERIOR:
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ProductPresale';        -- 1
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'OrderItem'
--      AND COLUMN_NAME IN ('isPreorder','preorderReleasedAt','presaleId');     -- 3
--   SELECT COUNT(*) FROM `OrderItem` WHERE `isPreorder` = true;                -- 0
--   SELECT COUNT(*) FROM `Order`;   -- igual que antes de aplicar
