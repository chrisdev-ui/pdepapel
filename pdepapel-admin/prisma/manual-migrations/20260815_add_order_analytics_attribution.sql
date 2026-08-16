-- Optional GA4 purchase attribution for consented public-shop checkouts.
-- Apply to Railway before deploying code that reads or writes these fields.
ALTER TABLE `Order`
  ADD COLUMN `analyticsClientId` VARCHAR(128) NULL,
  ADD COLUMN `analyticsPurchaseTrackedAt` DATETIME(3) NULL;

CREATE INDEX `Order_analyticsPurchaseTrackedAt_idx`
  ON `Order` (`analyticsPurchaseTrackedAt`);
