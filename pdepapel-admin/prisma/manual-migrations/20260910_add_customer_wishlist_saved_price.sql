-- Precio guardado en favoritos de cuenta (2026-09).
-- Aditivo y nulo: las filas existentes quedan sin precio y el aviso «bajó de
-- precio» solo aplica a lo que se guarde después de desplegar.
-- Aplicar en Railway justo antes de desplegar el código que lo usa.

ALTER TABLE `CustomerWishlistItem` ADD COLUMN `savedPrice` DOUBLE NULL;

-- Verificación:
-- SELECT COUNT(*) AS total, COUNT(savedPrice) AS con_precio FROM CustomerWishlistItem;
