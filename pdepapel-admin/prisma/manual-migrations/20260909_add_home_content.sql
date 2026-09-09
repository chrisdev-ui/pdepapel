-- Contenido de portada (rediseño de la portada de la tienda, 2026-09).
-- Aplicar en Railway justo ANTES de desplegar el código que lo usa.
-- Crea las tablas nuevas y copia las diapositivas y el banner principal
-- existentes. No borra nada: las tablas antiguas se eliminan después del
-- despliegue con `20260909_drop_legacy_home_banners.sql`.

CREATE TABLE `HomeContent` (
  `id`             VARCHAR(191) NOT NULL,
  `storeId`        VARCHAR(191) NOT NULL,
  `placement`      ENUM('HERO', 'CAMPAIGN') NOT NULL,
  `campaignType`   ENUM('SEASON', 'SHIPMENT', 'COLLECTION', 'OFFER') NULL,
  `eyebrow`        VARCHAR(80)  NULL,
  `title`          VARCHAR(191) NOT NULL,
  `subtitle`       VARCHAR(300) NULL,
  `primaryLabel`   VARCHAR(40)  NULL,
  `primaryUrl`     VARCHAR(500) NULL,
  `secondaryLabel` VARCHAR(40)  NULL,
  `secondaryUrl`   VARCHAR(500) NULL,
  `imageUrl`       VARCHAR(500) NULL,
  `imageAlt`       VARCHAR(160) NULL,
  `isActive`       TINYINT(1)   NOT NULL DEFAULT 1,
  `startsAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endsAt`         DATETIME(3)  NULL,
  `earlyAccessSentAt` DATETIME(3) NULL,
  `arrivalSentAt`     DATETIME(3) NULL,
  `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `HomeContent_storeId_placement_isActive_startsAt_idx` (`storeId`, `placement`, `isActive`, `startsAt`),
  INDEX `HomeContent_storeId_createdAt_idx` (`storeId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `HomeContentProduct` (
  `homeContentId` VARCHAR(191) NOT NULL,
  `productId`     VARCHAR(191) NOT NULL,
  `position`      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`homeContentId`, `productId`),
  INDEX `HomeContentProduct_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Diapositivas → entradas HERO. Solo la más reciente queda activa; las demás
-- quedan como borradores reutilizables. El texto largo (label) pasa a subtítulo.
INSERT INTO `HomeContent`
  (`id`, `storeId`, `placement`, `campaignType`, `eyebrow`, `title`, `subtitle`,
   `primaryLabel`, `primaryUrl`, `secondaryLabel`, `secondaryUrl`, `imageUrl`, `imageAlt`,
   `isActive`, `startsAt`, `endsAt`, `createdAt`, `updatedAt`)
SELECT
  b.`id`, b.`storeId`, 'HERO', NULL, NULL,
  LEFT(COALESCE(NULLIF(TRIM(b.`title`), ''), b.`label`), 191),
  LEFT(NULLIF(TRIM(b.`label`), ''), 300),
  LEFT(NULLIF(TRIM(b.`buttonLabel`), ''), 40),
  LEFT(NULLIF(TRIM(b.`redirectUrl`), ''), 500),
  NULL, NULL,
  LEFT(b.`imageUrl`, 500), NULL,
  CASE WHEN b.`id` = (
    SELECT b2.`id` FROM `Billboard` b2 WHERE b2.`storeId` = b.`storeId` ORDER BY b2.`createdAt` DESC LIMIT 1
  ) THEN 1 ELSE 0 END,
  b.`createdAt`, NULL, b.`createdAt`, b.`updatedAt`
FROM `Billboard` b;

-- Banner principal → entrada CAMPAIGN de tipo temporada, DESACTIVADA: el texto
-- actual («Empieza el año creando») está vencido y el banner solo debe
-- aparecer cuando haya una campaña vigente. La admin lo reactiva con texto y
-- fechas nuevos desde Contenido de la tienda › Portada.
INSERT INTO `HomeContent`
  (`id`, `storeId`, `placement`, `campaignType`, `eyebrow`, `title`, `subtitle`,
   `primaryLabel`, `primaryUrl`, `secondaryLabel`, `secondaryUrl`, `imageUrl`, `imageAlt`,
   `isActive`, `startsAt`, `endsAt`, `createdAt`, `updatedAt`)
SELECT
  m.`id`, m.`storeId`, 'CAMPAIGN', 'SEASON', NULL,
  LEFT(COALESCE(NULLIF(TRIM(m.`title`), ''), 'Banner de campaña'), 191),
  LEFT(NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(m.`label1`), ''), NULLIF(TRIM(m.`highlight`), ''), NULLIF(TRIM(m.`label2`), ''))), ''), 300),
  'Ver más',
  LEFT(NULLIF(TRIM(m.`callToAction`), ''), 500),
  NULL, NULL,
  LEFT(m.`imageUrl`, 500), NULL,
  0, m.`createdAt`, NULL, m.`createdAt`, m.`updatedAt`
FROM `MainBanner` m;

-- Los banners con enlace (`Banner`) no se migran: la sección desaparece de la
-- portada y las categorías cumplen esa función.

-- Verificación:
-- SELECT placement, isActive, COUNT(*) FROM HomeContent GROUP BY placement, isActive;
