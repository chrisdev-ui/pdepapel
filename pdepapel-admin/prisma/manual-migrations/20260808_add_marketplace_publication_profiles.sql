-- Apply in Railway only after the matching application deployment has been reviewed.
-- This migration is additive and leaves existing Mercado Libre templates unchanged.

CREATE TABLE `MarketplacePublicationProfile` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `localCategoryId` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `attributes` JSON NOT NULL,
  `stockSafetyBuffer` INTEGER NOT NULL DEFAULT 1,
  `minimumMarginAmount` DOUBLE NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MarketplacePublicationProfile_storeId_localCategoryId_key`(`storeId`, `localCategoryId`),
  INDEX `MarketplacePublicationProfile_localCategoryId_idx`(`localCategoryId`),
  INDEX `MarketplacePublicationProfile_storeId_updatedAt_idx`(`storeId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
