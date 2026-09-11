-- Reembolsos de ventas de Mercado Libre (2026-09).
-- Aplicar en Railway ANTES de desplegar el código que lo usa: la
-- sincronización de ventas escribe `refundedAmount` y los nuevos estados en
-- cada webhook, así que el código nuevo sobre la tabla vieja fallaría en la
-- primera venta. Aditivo: la columna es nula y el ENUM solo gana valores, las
-- filas existentes no cambian.
--
-- PARTIALLY_REFUNDED: Mercado Libre devolvió parte del pago; la venta sigue
--   contando como ingreso por su neto real (total − cargos − reembolso).
-- REFUNDED: reembolso total, contracargo o cancelación en curso; no cuenta
--   como ingreso y el inventario vuelve solo al confirmar el retorno físico.

ALTER TABLE `MarketplaceOrder`
  ADD COLUMN `refundedAmount` DOUBLE NULL,
  MODIFY `status` ENUM(
    'PENDING', 'PAID', 'CANCELLED', 'SHIPPED', 'DELIVERED',
    'RETURN_PENDING', 'RETURNED', 'PARTIALLY_REFUNDED', 'REFUNDED'
  ) NOT NULL DEFAULT 'PENDING';

-- Verificación:
-- SELECT COLUMN_TYPE FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MarketplaceOrder' AND COLUMN_NAME IN ('status', 'refundedAmount');
-- SELECT status, COUNT(*) FROM MarketplaceOrder GROUP BY status;
