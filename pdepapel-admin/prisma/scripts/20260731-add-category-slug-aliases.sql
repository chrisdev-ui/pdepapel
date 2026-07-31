CREATE TABLE `CategorySlugAlias` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CategorySlugAlias_storeId_slug_key` (`storeId`, `slug`),
  INDEX `CategorySlugAlias_categoryId_idx` (`categoryId`),
  INDEX `CategorySlugAlias_storeId_createdAt_idx` (`storeId`, `createdAt`)
);

CREATE UNIQUE INDEX `Category_storeId_slug_key` ON `Category` (`storeId`, `slug`);
