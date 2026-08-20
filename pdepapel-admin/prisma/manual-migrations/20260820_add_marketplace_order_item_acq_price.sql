-- Apply in Railway only after the matching application deployment has been reviewed.
-- Additive migration: it adds a nullable acquisition-cost snapshot to marketplace
-- sale items and backfills it from the currently linked product.
--
-- Why: `MarketplaceOrderItem` stored no cost, so every profitability report read
-- `Product.acqPrice` live. An item that was never linked to a local product (or a
-- product without a registered cost) silently reported a cost of 0, which turned an
-- unknown cost into 100% profit. A paid sale is a historical record and must keep
-- its own cost snapshot.
--
-- Safety: no column is dropped, no row is deleted, and the backfill only writes rows
-- whose snapshot is still NULL and that already point at a local product. Sales with
-- no local product keep `acqPrice` NULL on purpose — the application reports them as
-- "cost unknown" instead of zero.

ALTER TABLE `MarketplaceOrderItem` ADD COLUMN `acqPrice` DOUBLE NULL;

UPDATE `MarketplaceOrderItem` AS `item`
INNER JOIN `Product` AS `product` ON `product`.`id` = `item`.`productId`
SET `item`.`acqPrice` = `product`.`acqPrice`
WHERE `item`.`acqPrice` IS NULL
  AND `item`.`productId` IS NOT NULL
  AND `product`.`acqPrice` IS NOT NULL
  AND `product`.`acqPrice` > 0;
