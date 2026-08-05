-- Apply in Railway before deploying the tax reports module.
CREATE TABLE `TaxPurchase` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `supplierName` VARCHAR(191) NOT NULL,
    `totalAmount` DECIMAL(15, 2) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaxPurchase_storeId_issuedAt_idx`(`storeId`, `issuedAt`),
    UNIQUE INDEX `TaxPurchase_storeId_supplierName_invoiceNumber_key`(`storeId`, `supplierName`, `invoiceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
