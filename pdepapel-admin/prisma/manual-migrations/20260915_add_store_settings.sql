-- Datos del negocio editables desde Configuración: horario, ciudad, si hay
-- tienda física, la sugerencia de pedido mínimo y el umbral de envío gratis.
--
-- Hasta ahora el horario vivía escrito a mano en el pie de página de la tienda
-- y en /nosotros, y la ciudad solo existía como constante de ENVÍO. Para que
-- el sitio y el bot no se contradigan, pasan a ser datos.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings';
--
-- Tabla nueva: no toca ninguna fila existente. Sin fila por tienda, todo lo
-- que la lee cae en su valor por defecto, así que se puede aplicar antes de
-- desplegar sin romper nada.

CREATE TABLE `StoreSettings` (
  `id`                    VARCHAR(191) NOT NULL,
  `storeId`               VARCHAR(191) NOT NULL,
  `alwaysOpen`            BOOLEAN NOT NULL DEFAULT false,
  `openingHours`          JSON NULL,
  `cityName`              VARCHAR(191) NULL,
  `hasPhysicalStore`      BOOLEAN NOT NULL DEFAULT false,
  `physicalAddress`       VARCHAR(191) NULL,
  `minOrderRule`          ENUM('NONE', 'MATCH_SHIPPING', 'FIXED') NOT NULL DEFAULT 'NONE',
  `minOrderAmount`        INT NULL,
  `freeShippingThreshold` INT NULL,
  `botEnabled`            BOOLEAN NOT NULL DEFAULT true,
  `createdAt`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`             DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `StoreSettings_storeId_key` (`storeId`),
  INDEX `StoreSettings_storeId_idx` (`storeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- VERIFICACIÓN POSTERIOR (debe devolver 1 y 0):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings';
--   SELECT COUNT(*) FROM `StoreSettings`;
