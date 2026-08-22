-- Apply in Railway only after the matching application deployment has been reviewed.
-- This migration is additive. It records title-only catalog changes so a reviewed
-- naming batch can be reversed without changing URLs, stock, prices, images, or orders.

CREATE TABLE `ProductNamingChange` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `entityType` ENUM('PRODUCT', 'PRODUCT_GROUP') NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `previousName` VARCHAR(191) NOT NULL,
  `nextName` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `changedBy` VARCHAR(191) NOT NULL,
  `revertedAt` DATETIME(3) NULL,
  `revertedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ProductNamingChange_store_batch_idx` (`storeId`, `batchId`),
  INDEX `ProductNamingChange_store_entity_created_idx` (`storeId`, `entityType`, `entityId`, `createdAt`),
  INDEX `ProductNamingChange_store_reverted_idx` (`storeId`, `revertedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
