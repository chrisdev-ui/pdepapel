-- Moderación y respuesta de reseñas (rediseño del panel, 2026-09).
-- Aplicar en Railway justo antes de desplegar el código que lo usa.
-- Aditivo: las reseñas existentes quedan PUBLISHED y sin respuesta.
-- No toca pedidos, pagos, inventario ni catálogo.

ALTER TABLE `Review`
  ADD COLUMN `status` ENUM('PUBLISHED', 'HIDDEN', 'PENDING') NOT NULL DEFAULT 'PUBLISHED' AFTER `comment`,
  ADD COLUMN `moderatedAt` DATETIME(3) NULL AFTER `status`,
  ADD COLUMN `moderatedBy` VARCHAR(128) NULL AFTER `moderatedAt`,
  ADD COLUMN `moderationNote` VARCHAR(300) NULL AFTER `moderatedBy`,
  ADD COLUMN `reply` TEXT NULL AFTER `moderationNote`,
  ADD COLUMN `repliedAt` DATETIME(3) NULL AFTER `reply`,
  ADD COLUMN `repliedBy` VARCHAR(128) NULL AFTER `repliedAt`;

CREATE INDEX `Review_storeId_status_idx` ON `Review`(`storeId`, `status`);
CREATE INDEX `Review_productId_status_idx` ON `Review`(`productId`, `status`);

-- Verificación:
-- SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME = 'Review' AND COLUMN_NAME IN ('status','reply');
