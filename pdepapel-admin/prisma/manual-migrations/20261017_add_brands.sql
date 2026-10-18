-- Marcas (fabricantes) en la tienda y el panel (feat/marcas, 2026-10-17).
-- Tabla `Brand` con su logo, permiso de uso del logo, alias para sugerir la
-- marca por el nombre del producto y visibilidad; `BrandSlugRedirect` guarda
-- las direcciones anteriores (/marcas/<viejo> → la marca) al cambiar la
-- dirección o fusionar dos marcas.
-- `Product.brandId` y `ProductGroup.brandId` enlazan la marca (en un grupo,
-- todas las variantes llevan la del grupo); `OrderItem.brandName` guarda el
-- nombre de la marca al crear cada línea de pedido (sin relleno de líneas
-- anteriores: NULL = sin marca o anterior a las marcas).
-- `Brand.parentBrandId` marca una línea de otra marca (Flower Power es una
-- línea de Primavera; Incolors, de Scribe): un solo nivel, sin FK (relationMode
-- prisma) y con un CHECK que impide que una marca sea línea de sí misma.
-- Los textos libres `Product.brand` y `ProductGroup.brand` NO se tocan: el
-- código desplegado hoy los sigue leyendo y escribiendo, así que este cambio
-- es solo aditivo y compatible con él.
-- Columnas nuevas opcionales y sin valor por defecto (instantáneo en MySQL 8),
-- dos tablas nuevas y tres índices sobre `Product`/`ProductGroup`.
--
-- Se aplica con el flujo guardado ANTES del push (el código nuevo lee estas columnas):
--   npm run prod:approve -- "<motivo>"
--   npm run prod:migrate -- prisma/manual-migrations/20261017_add_brands.sql --expect new
-- Después: 20261017_grant_copilot_ro_brands.sql.
--
-- VERIFICACIÓN (solo lectura):
--   SHOW TABLES LIKE 'Brand%';                                  -- Brand y BrandSlugRedirect
--   SHOW COLUMNS FROM `Brand` LIKE 'parentBrandId';             -- Null = YES
--   SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS
--     WHERE CONSTRAINT_NAME = 'Brand_parentBrandId_not_self';    -- 1 fila
--   SHOW COLUMNS FROM `Product` LIKE 'brandId';                 -- Null = YES
--   SHOW COLUMNS FROM `ProductGroup` LIKE 'brandId';            -- Null = YES
--   SHOW COLUMNS FROM `OrderItem` LIKE 'brandName';             -- Null = YES
--   SHOW INDEX FROM `Product` WHERE Key_name LIKE '%brandId%';  -- 2 índices
--   SELECT COUNT(*) FROM `Product` WHERE brandId IS NOT NULL;   -- 0

-- AlterTable
ALTER TABLE `ProductGroup` ADD COLUMN `brandId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `brandId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `OrderItem` ADD COLUMN `brandName` VARCHAR(120) NULL;

-- CreateTable
CREATE TABLE `Brand` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(140) NOT NULL,
    `aliases` JSON NOT NULL,
    `manufacturerName` VARCHAR(120) NULL,
    `logoUrl` VARCHAR(500) NULL,
    `logoPublicId` VARCHAR(255) NULL,
    `logoWidth` INTEGER NULL,
    `logoHeight` INTEGER NULL,
    `logoHasBackground` BOOLEAN NOT NULL DEFAULT false,
    `logoInverseUrl` VARCHAR(500) NULL,
    `color` VARCHAR(7) NULL,
    `seoText` VARCHAR(160) NULL,
    `website` VARCHAR(500) NULL,
    `logoSourceUrl` VARCHAR(500) NULL,
    `logoPermission` ENUM('UNKNOWN', 'ALLOWED', 'PENDING', 'DENIED') NOT NULL DEFAULT 'UNKNOWN',
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isArchived` BOOLEAN NOT NULL DEFAULT false,
    `parentBrandId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NULL,

    INDEX `Brand_storeId_isVisible_isArchived_sortOrder_idx`(`storeId`, `isVisible`, `isArchived`, `sortOrder`),
    INDEX `Brand_parentBrandId_idx`(`parentBrandId`),
    UNIQUE INDEX `Brand_storeId_slug_key`(`storeId`, `slug`),
    PRIMARY KEY (`id`),
    -- A mano (Prisma no modela CHECK): una marca no es línea de sí misma. El
    -- resto (un solo nivel, misma tienda, padre sin archivar) lo valida el panel.
    CONSTRAINT `Brand_parentBrandId_not_self` CHECK (`parentBrandId` IS NULL OR `parentBrandId` <> `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BrandSlugRedirect` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `oldSlug` VARCHAR(140) NOT NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BrandSlugRedirect_brandId_idx`(`brandId`),
    UNIQUE INDEX `BrandSlugRedirect_storeId_oldSlug_key`(`storeId`, `oldSlug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ProductGroup_brandId_idx` ON `ProductGroup`(`brandId`);

-- CreateIndex
CREATE INDEX `Product_brandId_idx` ON `Product`(`brandId`);

-- CreateIndex
CREATE INDEX `Product_storeId_brandId_isArchived_idx` ON `Product`(`storeId`, `brandId`, `isArchived`);
