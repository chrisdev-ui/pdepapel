-- Cápsulas sorpresa como producto normal + escalera de precio por cantidad
-- (2026-09-20).
--
-- Una cápsula deja de ser una fila serializada atada a una feria y pasa a ser
-- un producto corriente con su propio stock: así se vende igual en el punto de
-- venta, en la tienda en línea y en una feria, sin una ruta nueva por canal.
--
-- `CapsuleBatch` guarda cada empaque (qué entró, cuánto costó, cuántas
-- cápsulas salieron) y congela el costo unitario, porque el `acqPrice` de los
-- productos de origen cambia con el tiempo y el margen de una venta vieja no
-- puede moverse con él.
--
-- `ProductPriceTier` es la escalera de precio por cantidad de CUALQUIER
-- producto, no solo de las cápsulas: gana el peldaño con el `minQuantity` más
-- alto que no pase de lo pedido. Nunca se suma a una oferta; el código se
-- queda con el precio más bajo de los dos.
--
-- Aditivo: no toca `Product`, `FairCapsule` ni `RestockOrder`. Solo agrega dos
-- valores al ENUM de movimientos y tres tablas nuevas.
--
-- Aplicar en Railway ANTES de desplegar el código que lo escribe: si el código
-- llega primero, empacar un lote falla al escribir el movimiento y la
-- transacción se revierte entera.

ALTER TABLE `InventoryMovement`
  MODIFY COLUMN `type` ENUM(
    'ORDER_PLACED',
    'ORDER_CANCELLED',
    'MANUAL_ADJUSTMENT',
    'INITIAL_MIGRATION',
    'RETURN',
    'DAMAGE',
    'LOST',
    'PROMOTION',
    'PURCHASE',
    'INITIAL_INTAKE',
    'RESTOCK_RECEIVED',
    'STORE_USE',
    'FESTIVAL_ALLOCATION',
    'FESTIVAL_RETURN',
    'IN_PERSON_SALE',
    'VARIANT_CONVERSION',
    'CAPSULE_PACKED',
    'CAPSULE_UNPACKED'
  ) NOT NULL;

CREATE TABLE `CapsuleBatch` (
  `id`               VARCHAR(191) NOT NULL,
  `storeId`          VARCHAR(191) NOT NULL,
  `capsuleProductId` VARCHAR(191) NOT NULL,
  `quantity`         INT          NOT NULL,
  `unitCost`         DOUBLE       NOT NULL,
  `totalCost`        DOUBLE       NOT NULL,
  `notes`            TEXT         NULL,
  `createdBy`        VARCHAR(191) NULL,
  `unpackedAt`       DATETIME(3)  NULL,
  `unpackedBy`       VARCHAR(191) NULL,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `CapsuleBatch_storeId_createdAt_idx` (`storeId`, `createdAt`),
  INDEX `CapsuleBatch_capsuleProductId_idx` (`capsuleProductId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CapsuleBatchItem` (
  `id`        VARCHAR(191) NOT NULL,
  `batchId`   VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `quantity`  INT          NOT NULL,
  `unitCost`  DOUBLE       NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CapsuleBatchItem_batchId_productId_key` (`batchId`, `productId`),
  INDEX `CapsuleBatchItem_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductPriceTier` (
  `id`          VARCHAR(191) NOT NULL,
  `storeId`     VARCHAR(191) NOT NULL,
  `productId`   VARCHAR(191) NOT NULL,
  `minQuantity` INT          NOT NULL,
  `unitPrice`   DOUBLE       NOT NULL,
  `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ProductPriceTier_productId_minQuantity_key` (`productId`, `minQuantity`),
  INDEX `ProductPriceTier_storeId_idx` (`storeId`),
  INDEX `ProductPriceTier_productId_minQuantity_idx` (`productId`, `minQuantity`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verificación:
-- SHOW COLUMNS FROM InventoryMovement LIKE 'type';
-- SHOW TABLES LIKE 'Capsule%';
-- SHOW TABLES LIKE 'ProductPriceTier';
