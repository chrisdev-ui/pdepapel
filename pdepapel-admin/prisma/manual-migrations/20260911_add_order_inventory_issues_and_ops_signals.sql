-- Señales de estado que antes solo vivían en los logs (2026-09).
-- Aplicar en Railway justo antes de desplegar el código que las usa. Aditivo:
-- tres tablas nuevas, ninguna columna existente cambia.
--
-- 1) OrderInventoryIssue: línea de inventario que no se pudo mover al cambiar
--    un pedido de estado (pago, cancelación, borrado). El pedido siguió; la
--    fila es la deuda con el kardex hasta reintentar o conciliar. `orderId`
--    admite NULL para que la deuda sobreviva si el pedido se borra.
-- 2) JobRun: última corrida de cada cron / revalidación de la tienda.
-- 3) ShippingWebhookEvent: webhooks de EnvioClick sin envío que los reclame.

CREATE TABLE `OrderInventoryIssue` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NULL,
  `orderNumber` VARCHAR(191) NOT NULL,
  `kind` ENUM('DECREMENT', 'RESTOCK') NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `productName` VARCHAR(191) NOT NULL,
  `quantity` INTEGER NOT NULL,
  `reason` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  `resolvedBy` VARCHAR(191) NULL,
  `movementId` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  INDEX `OrderInventoryIssue_storeId_resolvedAt_idx` (`storeId`, `resolvedAt`),
  INDEX `OrderInventoryIssue_orderId_idx` (`orderId`),
  INDEX `OrderInventoryIssue_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `JobRun` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `ranAt` DATETIME(3) NOT NULL,
  `ok` BOOLEAN NOT NULL,
  `detail` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `JobRun_name_storeId_key` (`name`, `storeId`),
  INDEX `JobRun_storeId_idx` (`storeId`),
  INDEX `JobRun_ranAt_idx` (`ranAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ShippingWebhookEvent` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NULL,
  `provider` VARCHAR(191) NOT NULL DEFAULT 'ENVIOCLICK',
  `idOrder` VARCHAR(191) NULL,
  `myShipmentReference` VARCHAR(191) NULL,
  `payload` JSON NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `ShippingWebhookEvent_storeId_resolvedAt_idx` (`storeId`, `resolvedAt`),
  INDEX `ShippingWebhookEvent_idOrder_idx` (`idOrder`),
  INDEX `ShippingWebhookEvent_myShipmentReference_idx` (`myShipmentReference`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verificación:
-- SELECT COUNT(*) FROM OrderInventoryIssue; SELECT COUNT(*) FROM JobRun; SELECT COUNT(*) FROM ShippingWebhookEvent;
