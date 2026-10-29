-- Preventa con anticipo, Lote 1 (2026-10-28, feat/preventa-anticipo). Aditiva: columnas nulas o con default, un valor nuevo
-- al FINAL del ENUM de Order.status (ALTER instantáneo en MySQL 8.4, sin copiar la tabla), dos tablas nuevas y un índice.
-- Sin datos: ningún pedido ni preventa existente cambia (ProductPresale tiene 0 filas en producción el 2026-10-28).
--   * Order.status + DEPOSIT_PAID («Anticipo recibido»): no es venta, no tiene paidAt; ningún barrido lo cancela.
--   * Order.paymentPlan / depositAmount / depositPaidAt / balanceRequestedAt / balanceDueAt / analyticsDepositTrackedAt /
--     preorderTermsVersion: el plan de pago del pedido y la copia fija del anticipo acordado.
--   * ProductPresale: unitLimit y expectedArrivalAt pasan a NULL (sin tope / fecha por confirmar) y suma paymentMode,
--     depositType, depositValue, expectedArrivalText, termsText, balanceDueDays.
--   * Product.marginExceptionReason / marginExceptionAt / marginExceptionBy: «Margen bajo» a propósito.
--   * OrderPayment: cada cobro (anticipo, saldo) con su referencia propia de pasarela (`<orderNumber>-A` / `-S`, única).
--   * PreorderWaitlistEntry: la lista de espera de una preventa (panel y formulario «Avísame»).
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre `railway`.* y ve todo sin otra línea. `copilot_ro` no recibe nada: sus
-- permisos son por tabla y por columna y el Copiloto no lee estas (la lista de espera tiene datos de contacto).
--
-- Orden: se aplica ANTES del push (el panel nuevo escribe DEPOSIT_PAID y lee estas columnas; el código viejo no las mira).
-- Lo corre Christian:
--   npm run prod:approve -- "Preventa con anticipo L1 (20261107_add_presale_deposits_and_waitlist)"
--   npm run prod:migrate -- prisma/manual-migrations/20261107_add_presale_deposits_and_waitlist.sql --expect new

ALTER TABLE `Order`
    MODIFY `status` ENUM('DRAFT', 'QUOTATION', 'VIEWED', 'ACCEPTED', 'REJECTED', 'CREATED', 'PENDING', 'PAID', 'SENT', 'CANCELLED', 'DEPOSIT_PAID') NOT NULL DEFAULT 'CREATED';

ALTER TABLE `Order`
    ADD COLUMN `paymentPlan` ENUM('FULL', 'DEPOSIT') NOT NULL DEFAULT 'FULL',
    ADD COLUMN `depositAmount` DOUBLE NULL,
    ADD COLUMN `depositPaidAt` DATETIME(3) NULL,
    ADD COLUMN `balanceRequestedAt` DATETIME(3) NULL,
    ADD COLUMN `balanceDueAt` DATETIME(3) NULL,
    ADD COLUMN `analyticsDepositTrackedAt` DATETIME(3) NULL,
    ADD COLUMN `preorderTermsVersion` VARCHAR(20) NULL;

CREATE INDEX `Order_storeId_paymentPlan_status_idx` ON `Order`(`storeId`, `paymentPlan`, `status`);

ALTER TABLE `Product`
    ADD COLUMN `marginExceptionReason` VARCHAR(255) NULL,
    ADD COLUMN `marginExceptionAt` DATETIME(3) NULL,
    ADD COLUMN `marginExceptionBy` VARCHAR(191) NULL;

ALTER TABLE `ProductPresale`
    MODIFY `expectedArrivalAt` DATETIME(3) NULL,
    MODIFY `unitLimit` INTEGER NULL,
    ADD COLUMN `expectedArrivalText` VARCHAR(120) NULL,
    ADD COLUMN `paymentMode` ENUM('FULL', 'DEPOSIT') NOT NULL DEFAULT 'FULL',
    ADD COLUMN `depositType` ENUM('FIXED', 'PERCENT') NULL,
    ADD COLUMN `depositValue` DOUBLE NULL,
    ADD COLUMN `termsText` TEXT NULL,
    ADD COLUMN `balanceDueDays` INTEGER NULL;

CREATE TABLE `OrderPayment` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `kind` ENUM('DEPOSIT', 'BALANCE') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'VOIDED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `amount` DOUBLE NOT NULL,
    `method` ENUM('COD', 'BankTransfer', 'Wompi', 'PayU', 'Bold', 'CASH', 'GiftCard') NOT NULL,
    `gatewayReference` VARCHAR(191) NULL,
    `transactionId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `OrderPayment_gatewayReference_key`(`gatewayReference`),
    INDEX `OrderPayment_orderId_kind_status_idx`(`orderId`, `kind`, `status`),
    INDEX `OrderPayment_storeId_paidAt_idx`(`storeId`, `paidAt`),
    INDEX `OrderPayment_storeId_kind_status_idx`(`storeId`, `kind`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PreorderWaitlistEntry` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `presaleId` VARCHAR(191) NULL,
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `handle` VARCHAR(80) NULL,
    `email` VARCHAR(191) NULL,
    `channel` ENUM('WHATSAPP', 'INSTAGRAM', 'TIKTOK', 'WEB', 'OTHER') NOT NULL,
    `note` TEXT NULL,
    `status` ENUM('WAITING', 'CONTACTED', 'CONVERTED', 'DISCARDED') NOT NULL DEFAULT 'WAITING',
    `consentText` TEXT NULL,
    `consentVersion` VARCHAR(32) NULL,
    `orderId` VARCHAR(191) NULL,
    `contactedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `PreorderWaitlistEntry_storeId_productId_status_createdAt_idx`(`storeId`, `productId`, `status`, `createdAt`),
    INDEX `PreorderWaitlistEntry_productId_idx`(`productId`),
    INDEX `PreorderWaitlistEntry_presaleId_idx`(`presaleId`),
    INDEX `PreorderWaitlistEntry_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- VERIFICACIÓN (solo lectura, como pdepapel_ro):
-- SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway' AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'status';
--   -- termina en ,'CANCELLED','DEPOSIT_PAID')
-- SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway'
--   AND ((TABLE_NAME = 'Order' AND COLUMN_NAME IN ('paymentPlan', 'depositAmount', 'depositPaidAt', 'balanceRequestedAt',
--          'balanceDueAt', 'analyticsDepositTrackedAt', 'preorderTermsVersion'))
--     OR (TABLE_NAME = 'Product' AND COLUMN_NAME IN ('marginExceptionReason', 'marginExceptionAt', 'marginExceptionBy'))
--     OR (TABLE_NAME = 'ProductPresale' AND COLUMN_NAME IN ('expectedArrivalText', 'paymentMode', 'depositType', 'depositValue',
--          'termsText', 'balanceDueDays')));  -- 16
-- SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway' AND TABLE_NAME = 'ProductPresale'
--   AND COLUMN_NAME IN ('expectedArrivalAt', 'unitLimit');  -- YES, YES
-- SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'railway' AND TABLE_NAME IN ('OrderPayment', 'PreorderWaitlistEntry');  -- 2
-- SELECT COUNT(*) FROM `Order` WHERE paymentPlan <> 'FULL' OR status = 'DEPOSIT_PAID';  -- 0
