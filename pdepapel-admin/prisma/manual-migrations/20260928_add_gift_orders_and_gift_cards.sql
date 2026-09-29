-- Pedidos regalo y tarjetas de regalo (2026-09-28). Una sola migración para
-- las dos partes del trabajo (sustituye a 20260928_add_order_gift_fields.sql,
-- que nunca se aplicó).
--
-- Motivo: una clienta compró un regalo y la confirmación con productos y
-- precios le llegó a quien lo recibía; además la tienda no podía vender
-- tarjetas de regalo. Ahora el pedido distingue quién compra de quién
-- recibe, y existe una tarjeta de regalo con saldo que se usa al pagar.
--
-- `Order`: `email`, `fullName`, `phone` y `documentId` NO cambian de
-- significado (son de quien compra). Las columnas `gift*` guardan a quien
-- recibe. `giftCardId`/`giftCardAmount` dicen qué tarjeta cubrió cuánto de
-- un pedido; `total` no cambia por una tarjeta (lo que va a la pasarela es
-- `total - giftCardAmount`). `type` gana GIFT_CARD (la compra de una
-- tarjeta, que no es ingreso) y `PaymentDetails.method` gana GiftCard (un
-- pedido cubierto entero, sin pasarela).
--
-- `GiftCard` guarda solo el sha256 del código y sus últimos cuatro
-- caracteres: el código en claro solo existe en el correo. `balance` es una
-- caché del libro `GiftCardMovement` (cada cambio de saldo es una fila con
-- el saldo resultante y una clave de idempotencia). `GiftCardDenomination`
-- son los valores a la venta.
--
-- PURAMENTE ADITIVA: columnas opcionales o con valor por defecto, dos
-- valores nuevos de enum y tres tablas nuevas. No toca datos existentes.
-- Aplicar en Railway ANTES de desplegar el código que la lee: las lecturas
-- de pedidos sin `select` traen todas las columnas y fallarían sin ellas.
--
-- TRAMPA DE REVERSIÓN (como VARIANT_CONVERSION): una vez exista una fila con
-- `type = 'GIFT_CARD'` o `method = 'GiftCard'`, el cliente de Prisma anterior
-- lanza al leerla. Un revert del código debe conservar los dos valores de
-- enum; nunca se quitan de estas columnas.

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `giftCardAmount` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `giftCardId` VARCHAR(191) NULL,
    ADD COLUMN `giftMessage` TEXT NULL,
    ADD COLUMN `giftRecipientEmail` VARCHAR(191) NULL,
    ADD COLUMN `giftRecipientName` VARCHAR(191) NULL,
    ADD COLUMN `giftRecipientPhone` VARCHAR(191) NULL,
    ADD COLUMN `isGift` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `type` ENUM('STANDARD', 'CUSTOM', 'QUOTATION', 'FESTIVAL', 'POINT_OF_SALE', 'GIFT_CARD') NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE `PaymentDetails` MODIFY `method` ENUM('COD', 'BankTransfer', 'Wompi', 'PayU', 'Bold', 'CASH', 'GiftCard') NOT NULL DEFAULT 'BankTransfer';

-- CreateTable
CREATE TABLE `GiftCard` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(64) NOT NULL,
    `codeLast4` VARCHAR(4) NOT NULL,
    `initialAmount` DOUBLE NOT NULL,
    `balance` DOUBLE NOT NULL,
    `status` ENUM('ACTIVE', 'VOID') NOT NULL DEFAULT 'ACTIVE',
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `buyerEmail` VARCHAR(191) NULL,
    `recipientName` VARCHAR(191) NULL,
    `recipientEmail` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deliveredAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GiftCard_codeHash_key`(`codeHash`),
    UNIQUE INDEX `GiftCard_purchaseOrderId_key`(`purchaseOrderId`),
    INDEX `GiftCard_storeId_idx`(`storeId`),
    INDEX `GiftCard_storeId_status_idx`(`storeId`, `status`),
    INDEX `GiftCard_storeId_createdAt_idx`(`storeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GiftCardMovement` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `giftCardId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `type` ENUM('ISSUED', 'HELD', 'REDEEMED', 'RELEASED', 'REVERSED', 'VOIDED', 'REISSUED') NOT NULL,
    `amount` DOUBLE NOT NULL,
    `balanceAfter` DOUBLE NOT NULL,
    `reason` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GiftCardMovement_idempotencyKey_key`(`idempotencyKey`),
    INDEX `GiftCardMovement_giftCardId_createdAt_idx`(`giftCardId`, `createdAt`),
    INDEX `GiftCardMovement_orderId_idx`(`orderId`),
    INDEX `GiftCardMovement_storeId_createdAt_idx`(`storeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GiftCardDenomination` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GiftCardDenomination_storeId_isActive_sortOrder_idx`(`storeId`, `isActive`, `sortOrder`),
    UNIQUE INDEX `GiftCardDenomination_storeId_amount_key`(`storeId`, `amount`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_giftCardId_idx` ON `Order`(`giftCardId`);
