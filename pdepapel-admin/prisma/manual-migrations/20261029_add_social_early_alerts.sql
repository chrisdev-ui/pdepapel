-- Alerta temprana de redes, 2026-10-29. Aditiva: una tabla nueva, nada existente cambia.
--   * SocialEarlyAlert: «Va despegando» / «Va lenta» de una publicación a las 2–6 h.
--     Única por publicación (el antiduplicado: crear la fila reclama la alerta).
--     emailedAt se reserva con una sola sentencia que respeta el tope de 3 correos por día de Bogotá.
--   Sin llaves foráneas (relationMode = "prisma"): índices propios.
--   La alerta sale APAGADA (SCHEDULED_JOBS["social-early-alert"]); aplicar esta migración no envía nada.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de la fase B3b:
--   npm run prod:approve -- "Alerta temprana de redes (20261029_add_social_early_alerts)"
--   npm run prod:migrate -- prisma/manual-migrations/20261029_add_social_early_alerts.sql --expect new

CREATE TABLE `SocialEarlyAlert` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `socialPostId` VARCHAR(191) NOT NULL,
    `kind` ENUM('DESPEGANDO', 'LENTA') NOT NULL,
    `ratio` DOUBLE NOT NULL,
    `hoursSincePost` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `emailedAt` DATETIME(3) NULL,

    UNIQUE INDEX `SocialEarlyAlert_socialPostId_key`(`socialPostId`),
    INDEX `SocialEarlyAlert_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `SocialEarlyAlert_storeId_emailedAt_idx`(`storeId`, `emailedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

