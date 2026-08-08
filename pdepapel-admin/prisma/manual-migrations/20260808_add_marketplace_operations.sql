-- Apply in Railway only after the matching application deployment has been reviewed.
-- This migration is additive: it preserves existing Mercado Libre records and outbox events.

ALTER TABLE `MarketplaceListing`
  ADD COLUMN `minimumMarginAmount` DOUBLE NULL;

ALTER TABLE `MarketplaceOutboxEvent`
  MODIFY `action` ENUM(
    'SYNC_STOCK',
    'SYNC_PRICE',
    'SYNC_LISTING_CONTENT',
    'SYNC_LISTING_STATUS',
    'PUBLISH_LISTING',
    'PAUSE_LISTING',
    'ACTIVATE_LISTING',
    'SYNC_ORDER_FINANCIALS',
    'SEND_ORDER_NOTIFICATION'
  ) NOT NULL;

CREATE TABLE `MarketplaceQuestion` (
  `id` VARCHAR(191) NOT NULL,
  `connectionId` VARCHAR(191) NOT NULL,
  `listingId` VARCHAR(191) NULL,
  `productId` VARCHAR(191) NULL,
  `externalQuestionId` VARCHAR(191) NOT NULL,
  `externalItemId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `question` TEXT NOT NULL,
  `answer` TEXT NULL,
  `askedAt` DATETIME(3) NULL,
  `answeredAt` DATETIME(3) NULL,
  `lastRemoteUpdateAt` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MarketplaceQuestion_connectionId_externalQuestionId_key`(`connectionId`, `externalQuestionId`),
  INDEX `MarketplaceQuestion_connectionId_status_askedAt_idx`(`connectionId`, `status`, `askedAt`),
  INDEX `MarketplaceQuestion_listingId_idx`(`listingId`),
  INDEX `MarketplaceQuestion_productId_idx`(`productId`),
  INDEX `MarketplaceQuestion_externalItemId_idx`(`externalItemId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MarketplaceShipment` (
  `id` VARCHAR(191) NOT NULL,
  `connectionId` VARCHAR(191) NOT NULL,
  `marketplaceOrderId` VARCHAR(191) NULL,
  `externalShipmentId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `substatus` VARCHAR(191) NULL,
  `logisticsType` VARCHAR(191) NULL,
  `trackingNumber` VARCHAR(191) NULL,
  `lastRemoteUpdateAt` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MarketplaceShipment_connectionId_externalShipmentId_key`(`connectionId`, `externalShipmentId`),
  INDEX `MarketplaceShipment_connectionId_status_updatedAt_idx`(`connectionId`, `status`, `updatedAt`),
  INDEX `MarketplaceShipment_marketplaceOrderId_idx`(`marketplaceOrderId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MarketplaceClaim` (
  `id` VARCHAR(191) NOT NULL,
  `connectionId` VARCHAR(191) NOT NULL,
  `marketplaceOrderId` VARCHAR(191) NULL,
  `externalClaimId` VARCHAR(191) NOT NULL,
  `externalOrderId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL,
  `stage` VARCHAR(191) NULL,
  `type` VARCHAR(191) NULL,
  `reasonId` VARCHAR(191) NULL,
  `title` TEXT NULL,
  `dueAt` DATETIME(3) NULL,
  `lastRemoteUpdateAt` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MarketplaceClaim_connectionId_externalClaimId_key`(`connectionId`, `externalClaimId`),
  INDEX `MarketplaceClaim_connectionId_status_dueAt_idx`(`connectionId`, `status`, `dueAt`),
  INDEX `MarketplaceClaim_marketplaceOrderId_idx`(`marketplaceOrderId`),
  INDEX `MarketplaceClaim_externalOrderId_idx`(`externalOrderId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductVideo` (
  `id` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `url` TEXT NOT NULL,
  `cloudinaryId` VARCHAR(255) NULL,
  `format` VARCHAR(24) NULL,
  `durationSeconds` DOUBLE NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `bytes` INTEGER NULL,
  `isPrimary` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ProductVideo_productId_isPrimary_idx`(`productId`, `isPrimary`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MarketplaceCategoryTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `attributes` JSON NOT NULL,
  `stockSafetyBuffer` INTEGER NULL,
  `minimumMarginAmount` DOUBLE NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MarketplaceCategoryTemplate_storeId_categoryId_key`(`storeId`, `categoryId`),
  INDEX `MarketplaceCategoryTemplate_storeId_updatedAt_idx`(`storeId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
