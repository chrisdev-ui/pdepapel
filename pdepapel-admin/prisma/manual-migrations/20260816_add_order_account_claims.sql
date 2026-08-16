-- Apply in Railway only after the matching application deployment has been reviewed.
-- This additive migration stores only one-way hashes for short-lived customer order claims.

CREATE TABLE `OrderAccountClaim` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `claimedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `OrderAccountClaim_orderId_key`(`orderId`),
  UNIQUE INDEX `OrderAccountClaim_tokenHash_key`(`tokenHash`),
  INDEX `OrderAccountClaim_storeId_expiresAt_idx`(`storeId`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
