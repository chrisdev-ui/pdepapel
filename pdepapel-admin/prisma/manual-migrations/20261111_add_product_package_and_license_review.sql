-- Mercado Libre B2 (2026-10-31). Aditiva: seis columnas NULL en Product, sin valor por defecto ni índice.
--   * packageWeightGrams / packageHeightCm / packageWidthCm / packageLengthCm: el paquete real ya empacado.
--     Mercado Libre cotiza el envío con estas medidas y las recibe al publicar (`shipping.dimensions` y los
--     atributos PACKAGE_*). Null = sin medir: se sigue suponiendo la caja por defecto, y así se rotula.
--   * mercadoLibreLicenseApprovedAt / …ApprovedBy: un nombre que parecía de personaje con licencia, en el nivel
--     «por revisar», que Christian aprobó para las tandas. Los de nivel «excluido» no se aprueban.
--
-- Orden: se aplica ANTES del push de esta rama. El cliente de Prisma nuevo pide estas columnas en toda lectura
-- de Product sin `select`; sin la migración, el despliegue rompe esas lecturas. El código vivo no las lee, así
-- que aplicarla antes no cambia nada.
--
-- Permisos: `pdepapel_ro` y `copilot_ro` tienen SELECT sobre la tabla Product entera y ven lo nuevo sin otra línea.
--
-- Lo corre Christian:
--   npm run prod:approve -- "Mercado Libre B2 (20261111_add_product_package_and_license_review)"
--   npm run prod:migrate -- prisma/manual-migrations/20261111_add_product_package_and_license_review.sql --expect new

ALTER TABLE `Product`
    ADD COLUMN `packageWeightGrams` INT NULL,
    ADD COLUMN `packageHeightCm` DOUBLE NULL,
    ADD COLUMN `packageWidthCm` DOUBLE NULL,
    ADD COLUMN `packageLengthCm` DOUBLE NULL,
    ADD COLUMN `mercadoLibreLicenseApprovedAt` DATETIME(3) NULL,
    ADD COLUMN `mercadoLibreLicenseApprovedBy` VARCHAR(191) NULL;
