-- 2026-10-05 · URL de productos borrados (SEO ola 2, P1-7b)
--
-- Borrar un producto (no archivarlo) se llevaba su URL: la fila desaparece,
-- la cascada borra sus alias y el enlace de Google daba 404 para siempre.
-- Esta tabla guarda, por cada slug o alias del producto borrado, su grupo y
-- su categoría, para que la tienda lo mande con 308 a una hermana viva o a
-- su categoría, igual que a un archivado.
--
-- Solo crea una tabla vacía: no toca ninguna otra tabla ni fila.
-- Aplicar ANTES de desplegar el código que la usa: ese código la consulta en
-- cada 404 de producto y la escribe en cada borrado; sin ella, el borrado
-- falla y el 404 se vuelve 500.

CREATE TABLE `DeletedProductUrl` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `productGroupId` VARCHAR(191) NULL,
  `deletedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `DeletedProductUrl_storeId_slug_key`(`storeId`, `slug`),
  INDEX `DeletedProductUrl_storeId_productId_idx`(`storeId`, `productId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verificación:
--   SHOW CREATE TABLE `DeletedProductUrl`;
--   SELECT COUNT(*) FROM `DeletedProductUrl`;   -- 0
-- Reversión (después de revertir el código):
--   DROP TABLE `DeletedProductUrl`;
