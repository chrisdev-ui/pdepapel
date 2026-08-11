-- Apply in Railway only after the matching application deployment has been reviewed.
-- This migration is additive. It records explicit Product Ads campaign changes
-- and does not alter listings, orders, inventory, or prior Marketplace data.

CREATE TABLE `MarketplaceCampaignAction` (
  `id` VARCHAR(191) NOT NULL,
  `connectionId` VARCHAR(191) NOT NULL,
  `externalCampaignId` VARCHAR(191) NOT NULL,
  `action` ENUM('PAUSE', 'ACTIVATE', 'UPDATE_SETTINGS') NOT NULL,
  `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `requestedBy` VARCHAR(191) NOT NULL,
  `before` JSON NOT NULL,
  `requested` JSON NOT NULL,
  `result` JSON NULL,
  `error` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `MktCampaignAction_conn_campaign_created_idx` (`connectionId`, `externalCampaignId`, `createdAt`),
  INDEX `MktCampaignAction_conn_status_created_idx` (`connectionId`, `status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
