-- Etiquetas de publicaciones de redes («Qué funciona»), 2026-10-27. Aditiva: dos tablas nuevas, nada existente cambia.
--   * SocialTag: valores de Formato y Gancho de la tienda; los de fábrica viven en el código y se crean al primer uso.
--     Único por (tienda, tipo, texto); con utf8mb4_unicode_ci «POV» y «pov» son la misma etiqueta.
--   * SocialPostTag: qué etiquetas tiene cada publicación; única por (publicación, etiqueta).
--   Sin llaves foráneas (relationMode = "prisma"): un índice por cada relación.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de la fase B2:
--   npm run prod:approve -- "Etiquetas de redes (20261027_add_social_tags)"
--   npm run prod:migrate -- prisma/manual-migrations/20261027_add_social_tags.sql --expect new

CREATE TABLE `SocialTag` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `kind` ENUM('FORMATO', 'GANCHO') NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialTag_storeId_idx`(`storeId`),
    UNIQUE INDEX `SocialTag_storeId_kind_label_key`(`storeId`, `kind`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SocialPostTag` (
    `id` VARCHAR(191) NOT NULL,
    `socialPostId` VARCHAR(191) NOT NULL,
    `socialTagId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialPostTag_socialTagId_idx`(`socialTagId`),
    UNIQUE INDEX `SocialPostTag_socialPostId_socialTagId_key`(`socialPostId`, `socialTagId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

