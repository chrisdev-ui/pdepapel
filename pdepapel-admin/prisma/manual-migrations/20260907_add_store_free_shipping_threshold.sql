-- Apply in Railway immediately before deploying the matching application code.
-- Additive: one nullable column on Store. NULL keeps free shipping disabled, so
-- existing stores, orders, payments, inventory, and catalog records are untouched.

ALTER TABLE `Store`
  ADD COLUMN `freeShippingThreshold` INT NULL AFTER `defaultPackageLength`;
