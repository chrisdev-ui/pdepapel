-- Alerta de imágenes rotas en el panel (2026-09).
-- Aplicar en Railway justo antes de desplegar el código que lo usa.
-- Aditivo: la marca la escribe el cron diario /api/cron/image-health.

ALTER TABLE `Image` ADD COLUMN `brokenAt` DATETIME(3) NULL;
CREATE INDEX `Image_brokenAt_idx` ON `Image`(`brokenAt`);

-- Verificación:
-- SELECT COUNT(*) FROM Image WHERE brokenAt IS NOT NULL;
