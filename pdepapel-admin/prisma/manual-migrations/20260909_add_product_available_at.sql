-- Productos «Próximamente» (rediseño de la portada, 2026-09).
-- Aplicar en Railway justo antes de desplegar el código que lo usa.
-- Aditivo: todos los productos existentes quedan disponibles (availableAt = NULL).

ALTER TABLE `Product` ADD COLUMN `availableAt` DATETIME(3) NULL;
CREATE INDEX `Product_storeId_availableAt_idx` ON `Product`(`storeId`, `availableAt`);

-- Verificación:
-- SELECT COUNT(*) FROM Product WHERE availableAt IS NOT NULL;
