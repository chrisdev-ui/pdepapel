-- Apply in Railway immediately before deploying the matching application code.
-- This migration is additive: legacy Size remains the shipping/SKU source while
-- customer-facing catalog options are prepared, reviewed, and assigned gradually.

ALTER TABLE `Type`
  ADD COLUMN `icon` VARCHAR(32) NULL;

ALTER TABLE `Category`
  ADD COLUMN `icon` VARCHAR(32) NULL;

CREATE TABLE `ShippingProfile` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `dimensionCode` VARCHAR(16) NULL,
  `weightCode` VARCHAR(16) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ShippingProfile_storeId_code_key` (`storeId`, `code`),
  INDEX `ShippingProfile_storeId_idx` (`storeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Product`
  ADD COLUMN `shippingProfileId` VARCHAR(191) NULL,
  ADD INDEX `Product_shippingProfileId_idx` (`shippingProfileId`);

CREATE TABLE `CatalogOption` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(60) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `displayOrder` INT NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CatalogOption_storeId_key_key` (`storeId`, `key`),
  INDEX `CatalogOption_storeId_idx` (`storeId`),
  INDEX `CatalogOption_storeId_isActive_displayOrder_idx` (`storeId`, `isActive`, `displayOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CatalogOptionValue` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `optionId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `value` VARCHAR(100) NOT NULL,
  `displayOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CatalogOptionValue_optionId_value_key` (`optionId`, `value`),
  INDEX `CatalogOptionValue_storeId_idx` (`storeId`),
  INDEX `CatalogOptionValue_optionId_idx` (`optionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CategoryCatalogOption` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `optionId` VARCHAR(191) NOT NULL,
  `displayOrder` INT NOT NULL DEFAULT 0,
  UNIQUE INDEX `CategoryCatalogOption_categoryId_optionId_key` (`categoryId`, `optionId`),
  INDEX `CategoryCatalogOption_storeId_idx` (`storeId`),
  INDEX `CategoryCatalogOption_categoryId_idx` (`categoryId`),
  INDEX `CategoryCatalogOption_optionId_idx` (`optionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductCatalogOptionValue` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `optionId` VARCHAR(191) NOT NULL,
  `optionValueId` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `ProductCatalogOptionValue_productId_optionId_key` (`productId`, `optionId`),
  INDEX `ProductCatalogOptionValue_storeId_idx` (`storeId`),
  INDEX `ProductCatalogOptionValue_productId_idx` (`productId`),
  INDEX `ProductCatalogOptionValue_optionId_idx` (`optionId`),
  INDEX `ProductCatalogOptionValue_optionValueId_idx` (`optionValueId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TypeSlugAlias` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `typeId` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `TypeSlugAlias_storeId_slug_key` (`storeId`, `slug`),
  INDEX `TypeSlugAlias_typeId_idx` (`typeId`),
  INDEX `TypeSlugAlias_storeId_createdAt_idx` (`storeId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CatalogMigrationSuggestion` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NULL,
  `productGroupId` VARCHAR(191) NULL,
  `fingerprint` VARCHAR(191) NOT NULL,
  `status` ENUM('PREPARED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED') NOT NULL DEFAULT 'PREPARED',
  `source` ENUM('DETERMINISTIC', 'AI') NOT NULL DEFAULT 'DETERMINISTIC',
  `confidence` DOUBLE NOT NULL DEFAULT 0,
  `payload` JSON NOT NULL,
  `evidence` JSON NULL,
  `model` VARCHAR(80) NULL,
  `promptVersion` VARCHAR(40) NULL,
  `appliedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CatalogMigrationSuggestion_storeId_fingerprint_key` (`storeId`, `fingerprint`),
  INDEX `CatalogMigrationSuggestion_storeId_status_idx` (`storeId`, `status`),
  INDEX `CatalogMigrationSuggestion_productId_idx` (`productId`),
  INDEX `CatalogMigrationSuggestion_productGroupId_idx` (`productGroupId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
