-- La misma pieza en varias redes, 2026-10-28. Aditiva: una tabla nueva y una columna nula, nada existente cambia.
--   * SocialPiece: agrupa la misma pieza (video, carrusel) publicada en Instagram y TikTok; la une la dueña a mano.
--   * SocialPost.socialPieceId: a qué pieza pertenece la publicación (NULL = a ninguna); índice propio.
--     La sincronización nunca la escribe; el código antiguo la ignora, así que aplicarla antes del push es seguro.
--   Sin llaves foráneas (relationMode = "prisma"): un índice por cada relación.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de la fase B4:
--   npm run prod:approve -- "Piezas de redes (20261028_add_social_pieces)"
--   npm run prod:migrate -- prisma/manual-migrations/20261028_add_social_pieces.sql --expect new

ALTER TABLE `SocialPost` ADD COLUMN `socialPieceId` VARCHAR(191) NULL;

CREATE TABLE `SocialPiece` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialPiece_storeId_idx`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SocialPost_socialPieceId_idx` ON `SocialPost`(`socialPieceId`);

