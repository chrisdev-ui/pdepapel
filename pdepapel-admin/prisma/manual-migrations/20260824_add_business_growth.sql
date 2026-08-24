-- Apply in Railway immediately before deploying the matching application code.
-- This additive migration records business cash planning and social campaign drafts.
-- It does not alter orders, payments, inventory, tax purchases, or marketplace records.

CREATE TABLE `BusinessCashPolicy` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `minimumOperatingReserve` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `taxReserveRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
  `reinvestmentRate` DECIMAL(5, 2) NOT NULL DEFAULT 50,
  `ownerDrawRate` DECIMAL(5, 2) NOT NULL DEFAULT 50,
  `marketingTestRate` DECIMAL(5, 2) NOT NULL DEFAULT 10,
  `minimumCampaignMarginPct` DECIMAL(5, 2) NOT NULL DEFAULT 35,
  `minimumCampaignStock` INT NOT NULL DEFAULT 5,
  `minimumCampaignDaysCover` INT NOT NULL DEFAULT 14,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `BusinessCashPolicy_storeId_key` (`storeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessCashMovement` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `type` ENUM('OPERATING_EXPENSE', 'MARKETING_SPEND', 'TAX_PAYMENT', 'INVENTORY_PURCHASE', 'OWNER_DRAW', 'OWNER_CONTRIBUTION', 'OTHER_INFLOW', 'OTHER_OUTFLOW') NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `description` VARCHAR(180) NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL,
  `reference` VARCHAR(120) NULL,
  `notes` TEXT NULL,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `BusinessCashMovement_storeId_occurredAt_idx` (`storeId`, `occurredAt`),
  INDEX `BusinessCashMovement_storeId_type_occurredAt_idx` (`storeId`, `type`, `occurredAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GrowthCampaign` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `channel` ENUM('INSTAGRAM', 'TIKTOK', 'MULTI_CHANNEL') NOT NULL,
  `objective` ENUM('TRAFFIC', 'SALES', 'ENGAGEMENT', 'REMARKETING') NOT NULL DEFAULT 'SALES',
  `status` ENUM('DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `seasonLabel` VARCHAR(80) NULL,
  `landingPath` VARCHAR(500) NOT NULL,
  `utmSource` VARCHAR(80) NOT NULL,
  `utmMedium` VARCHAR(80) NOT NULL,
  `utmCampaign` VARCHAR(120) NOT NULL,
  `brief` TEXT NULL,
  `plannedBudget` DECIMAL(15, 2) NULL,
  `actualSpend` DECIMAL(15, 2) NULL,
  `attributedRevenue` DECIMAL(15, 2) NULL,
  `externalCampaignId` VARCHAR(191) NULL,
  `externalUrl` VARCHAR(500) NULL,
  `startsAt` DATETIME(3) NULL,
  `endsAt` DATETIME(3) NULL,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `GrowthCampaign_storeId_status_createdAt_idx` (`storeId`, `status`, `createdAt`),
  INDEX `GrowthCampaign_storeId_channel_status_idx` (`storeId`, `channel`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GrowthCampaignProduct` (
  `id` VARCHAR(191) NOT NULL,
  `campaignId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GrowthCampaignProduct_campaignId_productId_key` (`campaignId`, `productId`),
  INDEX `GrowthCampaignProduct_productId_idx` (`productId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
