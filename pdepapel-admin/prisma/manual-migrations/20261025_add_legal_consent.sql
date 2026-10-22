-- Prueba de consentimiento legal (Ley 1581 / Decreto 1377), 2026-10-25. Aditiva, sin tocar filas:
--   * Order: versión de términos y privacidad que mostró la frase encima del botón de pago, hora del servidor y canal (CHECKOUT).
--     Solo los pedidos del checkout de la tienda; panel, punto de venta, feria, apartados y WhatsApp quedan en NULL.
--   * LegalConsentRecord: consentimiento al crear la cuenta (webhook user.created de Clerk), solo el id de Clerk; único por (usuario, canal) y por id del mensaje.
--   Sin IP ni user agent.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push:
--   npm run prod:approve -- "Consentimiento legal (20261025_add_legal_consent)"
--   npm run prod:migrate -- prisma/manual-migrations/20261025_add_legal_consent.sql --expect new

ALTER TABLE `Order` ADD COLUMN `legalConsentAt` DATETIME(3) NULL,
    ADD COLUMN `legalConsentChannel` ENUM('CHECKOUT', 'REGISTRO') NULL,
    ADD COLUMN `legalPrivacyVersion` VARCHAR(20) NULL,
    ADD COLUMN `legalTermsVersion` VARCHAR(20) NULL;

CREATE TABLE `LegalConsentRecord` (
    `id` VARCHAR(191) NOT NULL,
    `clerkUserId` VARCHAR(191) NOT NULL,
    `channel` ENUM('CHECKOUT', 'REGISTRO') NOT NULL,
    `termsVersion` VARCHAR(20) NOT NULL,
    `privacyVersion` VARCHAR(20) NOT NULL,
    `consentedAt` DATETIME(3) NOT NULL,
    `evidence` VARCHAR(40) NOT NULL,
    `sourceEventId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LegalConsentRecord_sourceEventId_key`(`sourceEventId`),
    UNIQUE INDEX `LegalConsentRecord_clerkUserId_channel_key`(`clerkUserId`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

