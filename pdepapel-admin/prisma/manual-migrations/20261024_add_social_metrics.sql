-- Métricas de redes (Instagram y TikTok), 2026-10-24. Aditiva: seis tablas nuevas, nada existente cambia.
--   * SocialAccount: una cuenta por tienda y red (estado, «Reconectar», último sync). tokenRef nunca es el token.
--   * SocialCredential: tokens de TikTok cifrados con SOCIAL_TOKEN_ENCRYPTION_KEY (lib/token-crypto).
--   * SocialOAuthState: state de un solo uso (hash) y code_verifier de PKCE cifrado; vence a los 10 min.
--   * SocialPost: publicaciones; la miniatura es efímera y se renueva en cada sincronización.
--   * SocialMetricSnapshot / SocialAccountSnapshot: solo se agregan filas (curvas por publicación y por cuenta).
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de la fase B:
--   npm run prod:approve -- "Métricas de redes (20261024_add_social_metrics)"
--   npm run prod:migrate -- prisma/manual-migrations/20261024_add_social_metrics.sql --expect new
CREATE TABLE `SocialAccount` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `platform` ENUM('INSTAGRAM', 'TIKTOK') NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `pageId` VARCHAR(191) NULL,
    `status` ENUM('OK', 'NEEDS_RECONNECT', 'DISABLED') NOT NULL DEFAULT 'OK',
    `statusReason` VARCHAR(191) NULL,
    `tokenRef` VARCHAR(191) NULL,
    `connectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSyncAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialAccount_storeId_idx`(`storeId`),
    UNIQUE INDEX `SocialAccount_storeId_platform_key`(`storeId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SocialCredential` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `platform` ENUM('INSTAGRAM', 'TIKTOK') NOT NULL,
    `encryptedAccessToken` TEXT NOT NULL,
    `encryptedRefreshToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` VARCHAR(255) NULL,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SocialCredential_storeId_platform_key`(`storeId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SocialOAuthState` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `platform` ENUM('INSTAGRAM', 'TIKTOK') NOT NULL,
    `stateHash` VARCHAR(64) NOT NULL,
    `encryptedCodeVerifier` TEXT NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SocialOAuthState_stateHash_key`(`stateHash`),
    INDEX `SocialOAuthState_storeId_platform_expiresAt_idx`(`storeId`, `platform`, `expiresAt`),
    INDEX `SocialOAuthState_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SocialPost` (
    `id` VARCHAR(191) NOT NULL,
    `socialAccountId` VARCHAR(191) NOT NULL,
    `platform` ENUM('INSTAGRAM', 'TIKTOK') NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `mediaType` VARCHAR(40) NULL,
    `productType` ENUM('REELS', 'FEED', 'CAROUSEL', 'STORY', 'VIDEO') NULL,
    `caption` TEXT NULL,
    `permalink` VARCHAR(512) NULL,
    `thumbnailUrl` TEXT NULL,
    `thumbnailCheckedAt` DATETIME(3) NULL,
    `durationSec` DOUBLE NULL,
    `postedAt` DATETIME(3) NOT NULL,
    `metricsSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialPost_socialAccountId_postedAt_idx`(`socialAccountId`, `postedAt`),
    UNIQUE INDEX `SocialPost_socialAccountId_externalId_key`(`socialAccountId`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SocialMetricSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `socialPostId` VARCHAR(191) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `hoursSincePost` DOUBLE NOT NULL,
    `views` INTEGER NULL,
    `reach` INTEGER NULL,
    `likes` INTEGER NULL,
    `comments` INTEGER NULL,
    `shares` INTEGER NULL,
    `saves` INTEGER NULL,
    `totalInteractions` INTEGER NULL,
    `avgWatchTimeMs` INTEGER NULL,
    `totalWatchTimeMs` BIGINT NULL,
    `skipRate` DOUBLE NULL,
    `raw` JSON NULL,

    INDEX `SocialMetricSnapshot_socialPostId_capturedAt_idx`(`socialPostId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SocialAccountSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `socialAccountId` VARCHAR(191) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `followers` INTEGER NULL,
    `following` INTEGER NULL,
    `mediaCount` INTEGER NULL,
    `likesTotal` INTEGER NULL,
    `profileViews` INTEGER NULL,
    `raw` JSON NULL,

    INDEX `SocialAccountSnapshot_socialAccountId_capturedAt_idx`(`socialAccountId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

