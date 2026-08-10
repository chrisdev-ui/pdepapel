-- Apply in Railway only after the matching application deployment has been reviewed.
-- This migration adds the in-person point-of-sale order and inventory audit types.

ALTER TABLE `Order`
  MODIFY `type` ENUM(
    'STANDARD',
    'CUSTOM',
    'QUOTATION',
    'FESTIVAL',
    'POINT_OF_SALE'
  ) NOT NULL DEFAULT 'STANDARD';

ALTER TABLE `InventoryMovement`
  MODIFY `type` ENUM(
    'ORDER_PLACED',
    'ORDER_CANCELLED',
    'MANUAL_ADJUSTMENT',
    'INITIAL_MIGRATION',
    'RETURN',
    'DAMAGE',
    'LOST',
    'PROMOTION',
    'PURCHASE',
    'INITIAL_INTAKE',
    'RESTOCK_RECEIVED',
    'STORE_USE',
    'FESTIVAL_ALLOCATION',
    'FESTIVAL_RETURN',
    'IN_PERSON_SALE'
  ) NOT NULL;

CREATE INDEX `Product_storeId_gtin_idx` ON `Product`(`storeId`, `gtin`);
