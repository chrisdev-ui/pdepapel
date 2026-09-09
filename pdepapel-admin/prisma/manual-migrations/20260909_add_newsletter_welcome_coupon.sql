-- Cupón de bienvenida y producto de interés del boletín (rediseño de la portada, 2026-09).
-- Aplicar en Railway justo antes de desplegar el código que lo usa. Aditivo.

ALTER TABLE `NewsletterSubscriber`
  ADD COLUMN `welcomeCouponId` VARCHAR(191) NULL,
  ADD COLUMN `interestProductId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `NewsletterSubscriber_welcomeCouponId_key` ON `NewsletterSubscriber`(`welcomeCouponId`);
CREATE INDEX `NewsletterSubscriber_storeId_interestProductId_idx` ON `NewsletterSubscriber`(`storeId`, `interestProductId`);

-- Verificación:
-- SELECT COUNT(*) FROM NewsletterSubscriber WHERE welcomeCouponId IS NOT NULL;
