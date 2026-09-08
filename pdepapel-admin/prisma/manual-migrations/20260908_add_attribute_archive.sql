-- Archivar atributos del catálogo (rediseño del panel, 2026-09).
-- Aplicar en Railway justo antes de desplegar el código que lo usa.
-- Aditivo: todos los atributos existentes quedan activos (isArchived = 0).
-- Los productos que usan un atributo archivado no cambian.

ALTER TABLE `Type`     ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `Category` ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `Size`     ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `Color`    ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `Design`   ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;

CREATE INDEX `Type_storeId_isArchived_idx`     ON `Type`(`storeId`, `isArchived`);
CREATE INDEX `Category_storeId_isArchived_idx` ON `Category`(`storeId`, `isArchived`);
CREATE INDEX `Size_storeId_isArchived_idx`     ON `Size`(`storeId`, `isArchived`);
CREATE INDEX `Color_storeId_isArchived_idx`    ON `Color`(`storeId`, `isArchived`);
CREATE INDEX `Design_storeId_isArchived_idx`   ON `Design`(`storeId`, `isArchived`);

-- Verificación:
-- SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE COLUMN_NAME = 'isArchived' AND TABLE_NAME IN ('Type','Category','Size','Color','Design');
