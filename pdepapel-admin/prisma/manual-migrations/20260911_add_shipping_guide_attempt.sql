-- Último intento fallido de crear la guía de EnvioClick (2026-09).
-- Aplicar en Railway justo antes de desplegar el código que lo usa. Aditivo.
-- Lo escribe PATCH /api/[storeId]/orders/[orderId] cuando la creación
-- automática de la guía falla; se limpia al crearse la guía.

ALTER TABLE `Shipping` ADD COLUMN `guideError` TEXT NULL;
ALTER TABLE `Shipping` ADD COLUMN `guideAttemptedAt` DATETIME(3) NULL;

-- Verificación:
-- SELECT COUNT(*) FROM Shipping WHERE guideError IS NOT NULL;
