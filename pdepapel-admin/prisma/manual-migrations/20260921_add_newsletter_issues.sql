-- Números del boletín, sus páginas y el registro de envíos (2026-09-21).
--
-- Paula arma la revista en Canva y exporta las páginas como imágenes. Un
-- número es una portada, unas páginas en orden y un texto de presentación; se
-- envía a mano a las suscriptoras confirmadas y queda marcado como enviado.
--
-- No se guarda un PDF a propósito: la cuenta de Cloudinary se pasó del plan
-- gratuito en septiembre de 2026 (29,7 de 25 créditos) y cada descarga cuenta
-- como GB servido. Con imágenes se reusa el cargador que ya reduce a 2000 px.
--
-- `NewsletterCampaignSend` es el registro que faltaba: hasta ahora un envío
-- solo dejaba una marca de tiempo en la fila del banner, sin decir a cuántas
-- personas llegó. Lo escriben los tres tipos de envío, no solo el nuevo.
--
-- PURAMENTE ADITIVA: tres tablas nuevas, ninguna columna existente cambia.
-- NO ES IDEMPOTENTE, y no puede serlo: MySQL 8 no tiene
-- `CREATE TABLE IF NOT EXISTS` con la garantía de que el esquema coincida, y
-- `ADD COLUMN IF NOT EXISTS` es de MariaDB, no de MySQL (lección de la
-- migración de BSUID, que se aplicó a medias por confundirlas). Se aplica una
-- vez, en orden, y se comprueba con las consultas del final.
--
-- `relationMode = "prisma"`: sin claves foráneas. Los índices de las columnas
-- de relación van a mano, y el borrado en cascada lo hace el código.

CREATE TABLE `NewsletterIssue` (
  `id`         VARCHAR(191) NOT NULL,
  `storeId`    VARCHAR(191) NOT NULL,
  `slug`       VARCHAR(160) NOT NULL,
  `title`      VARCHAR(160) NOT NULL,
  `intro`      VARCHAR(600) NULL,
  `coverUrl`   VARCHAR(500) NOT NULL,
  `coverAlt`   VARCHAR(160) NULL,
  `status`     ENUM('DRAFT', 'SENT') NOT NULL DEFAULT 'DRAFT',
  `sentAt`     DATETIME(3) NULL,
  `recipients` INT NULL,
  `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`  DATETIME(3) NOT NULL,
  UNIQUE INDEX `NewsletterIssue_storeId_slug_key` (`storeId`, `slug`),
  INDEX `NewsletterIssue_storeId_status_createdAt_idx` (`storeId`, `status`, `createdAt`),
  INDEX `NewsletterIssue_storeId_sentAt_idx` (`storeId`, `sentAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NewsletterIssuePage` (
  `id`        VARCHAR(191) NOT NULL,
  `issueId`   VARCHAR(191) NOT NULL,
  `imageUrl`  VARCHAR(500) NOT NULL,
  `alt`       VARCHAR(160) NULL,
  `position`  INT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `NewsletterIssuePage_issueId_position_idx` (`issueId`, `position`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NewsletterCampaignSend` (
  `id`            VARCHAR(191) NOT NULL,
  `storeId`       VARCHAR(191) NOT NULL,
  `kind`          VARCHAR(40) NOT NULL,
  `subject`       VARCHAR(200) NOT NULL,
  `recipients`    INT NOT NULL,
  `issueId`       VARCHAR(191) NULL,
  `homeContentId` VARCHAR(191) NULL,
  `sentAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `NewsletterCampaignSend_storeId_sentAt_idx` (`storeId`, `sentAt`),
  INDEX `NewsletterCampaignSend_issueId_idx` (`issueId`),
  INDEX `NewsletterCampaignSend_homeContentId_idx` (`homeContentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Comprobación: las tres tablas existen y están vacías.
--   SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME IN ('NewsletterIssue','NewsletterIssuePage','NewsletterCampaignSend');
