-- Apply in Railway only after the matching application deployment has been reviewed.
-- Adds server-enforced welcome benefits, account-synced favorites, saved addresses, and email order-claim tokens.

ALTER TABLE `OrderAccountClaim`
  DROP INDEX `OrderAccountClaim_orderId_key`,
  ADD COLUMN `source` ENUM('DEVICE', 'EMAIL') NOT NULL DEFAULT 'DEVICE' AFTER `orderId`,
  ADD UNIQUE INDEX `OrderAccountClaim_orderId_source_key` (`orderId`, `source`),
  ADD INDEX `OrderAccountClaim_orderId_idx` (`orderId`);

ALTER TABLE `Coupon`
  ADD COLUMN `isWelcomeBenefit` BOOLEAN NOT NULL DEFAULT FALSE AFTER `minOrderValue`,
  ADD INDEX `Coupon_storeId_isWelcomeBenefit_isActive_startDate_endDate_idx` (`storeId`, `isWelcomeBenefit`, `isActive`, `startDate`, `endDate`);

CREATE TABLE `CustomerWishlistItem` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(128) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `CustomerWishlistItem_storeId_userId_productId_key` (`storeId`, `userId`, `productId`),
  INDEX `CustomerWishlistItem_storeId_userId_createdAt_idx` (`storeId`, `userId`, `createdAt`),
  INDEX `CustomerWishlistItem_productId_idx` (`productId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CustomerAddress` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(128) NOT NULL,
  `label` VARCHAR(60) NOT NULL DEFAULT '',
  `fullName` VARCHAR(191) NOT NULL DEFAULT '',
  `phone` VARCHAR(191) NOT NULL DEFAULT '',
  `documentId` VARCHAR(191) NULL DEFAULT '',
  `address` VARCHAR(191) NOT NULL DEFAULT '',
  `address2` VARCHAR(191) NULL DEFAULT '',
  `city` VARCHAR(191) NULL DEFAULT '',
  `department` VARCHAR(191) NULL DEFAULT '',
  `daneCode` VARCHAR(191) NULL DEFAULT '',
  `neighborhood` VARCHAR(191) NULL DEFAULT '',
  `addressReference` VARCHAR(191) NULL DEFAULT '',
  `company` VARCHAR(191) NULL DEFAULT '',
  `isDefault` BOOLEAN NOT NULL DEFAULT FALSE,
  `lastUsedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `CustomerAddress_storeId_userId_isDefault_updatedAt_idx` (`storeId`, `userId`, `isDefault`, `updatedAt`),
  INDEX `CustomerAddress_storeId_userId_idx` (`storeId`, `userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CouponRedemption` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `couponId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(128) NOT NULL,
  `orderId` VARCHAR(191) NULL,
  `status` ENUM('RESERVED', 'REDEEMED', 'RELEASED') NOT NULL DEFAULT 'RESERVED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `redeemedAt` DATETIME(3) NULL,
  `releasedAt` DATETIME(3) NULL,

  UNIQUE INDEX `CouponRedemption_couponId_userId_key` (`couponId`, `userId`),
  INDEX `CouponRedemption_storeId_userId_status_idx` (`storeId`, `userId`, `status`),
  INDEX `CouponRedemption_orderId_idx` (`orderId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
