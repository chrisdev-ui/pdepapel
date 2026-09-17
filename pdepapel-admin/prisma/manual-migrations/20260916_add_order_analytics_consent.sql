-- Records whether the shopper had accepted analytics when the order was placed,
-- so the gap between paid orders and GA4 purchases can be measured instead of
-- estimated. Additive and nullable: existing orders stay NULL because consent
-- was not recorded before this change, and no backfill is possible.
-- Apply to Railway before deploying code that reads or writes this field.
ALTER TABLE `Order`
  ADD COLUMN `analyticsConsent` BOOLEAN NULL;
