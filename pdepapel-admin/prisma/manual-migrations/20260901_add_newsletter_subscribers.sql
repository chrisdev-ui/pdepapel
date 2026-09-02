-- Apply in Railway immediately before deploying the matching application code.
-- This additive migration enables verified newsletter subscriptions. It does not
-- change existing customers, orders, payments, inventory, or catalog records.

CREATE TABLE `NewsletterSubscriber` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(320) NOT NULL,
  `emailNormalized` VARCHAR(320) NOT NULL,
  `status` ENUM('PENDING', 'ACTIVE', 'UNSUBSCRIBED', 'SUPPRESSED') NOT NULL DEFAULT 'PENDING',
  `source` VARCHAR(120) NULL,
  `consentText` VARCHAR(500) NOT NULL,
  `consentVersion` VARCHAR(40) NOT NULL,
  `consentedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `confirmedAt` DATETIME(3) NULL,
  `unsubscribedAt` DATETIME(3) NULL,
  `confirmationTokenHash` VARCHAR(64) NULL,
  `confirmationExpiresAt` DATETIME(3) NULL,
  `unsubscribeTokenHash` VARCHAR(64) NULL,
  `lastConfirmationSentAt` DATETIME(3) NULL,
  `lastWelcomeSentAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `NewsletterSubscriber_confirmationTokenHash_key` (`confirmationTokenHash`),
  UNIQUE INDEX `NewsletterSubscriber_unsubscribeTokenHash_key` (`unsubscribeTokenHash`),
  UNIQUE INDEX `NewsletterSubscriber_storeId_emailNormalized_key` (`storeId`, `emailNormalized`),
  INDEX `NewsletterSubscriber_storeId_status_createdAt_idx` (`storeId`, `status`, `createdAt`),
  INDEX `NewsletterSubscriber_storeId_source_idx` (`storeId`, `source`),
  INDEX `NewsletterSubscriber_emailNormalized_idx` (`emailNormalized`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
