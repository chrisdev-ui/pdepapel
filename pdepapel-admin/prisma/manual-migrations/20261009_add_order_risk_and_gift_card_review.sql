-- Pedidos automatizados (bots) en la tienda: señales de riesgo por pedido y
-- revisión de las tarjetas de regalo antes de emitir el código.
--
-- Aditiva: `riskScore` NOT NULL con 0 por defecto (MySQL rellena las filas
-- existentes), `riskReasons` y `giftCardReview` NULL. No toca pedidos ni
-- tarjetas existentes.
--
-- APLICAR ANTES DEL DEPLOY: el código nuevo escribe y lee estas columnas al
-- crear pedidos, en el panel y en los webhooks de pago.
--
--   npm run prod:migrate -- prisma/manual-migrations/20261009_add_order_risk_and_gift_card_review.sql --expect new

ALTER TABLE `Order`
  ADD COLUMN `giftCardReview` ENUM('PENDING', 'APPROVED', 'REJECTED') NULL,
  ADD COLUMN `riskScore` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `riskReasons` TEXT NULL;

CREATE INDEX `Order_storeId_giftCardReview_idx` ON `Order`(`storeId`, `giftCardReview`);

-- Verificación:
--   SHOW COLUMNS FROM `Order` WHERE Field IN ('giftCardReview', 'riskScore', 'riskReasons');
--   SHOW INDEX FROM `Order` WHERE Key_name = 'Order_storeId_giftCardReview_idx';
--   SELECT COUNT(*) FROM `Order` WHERE `riskScore` <> 0;  → 0
-- Reversión (después de revertir el código):
--   DROP INDEX `Order_storeId_giftCardReview_idx` ON `Order`;
--   ALTER TABLE `Order` DROP COLUMN `giftCardReview`, DROP COLUMN `riskScore`, DROP COLUMN `riskReasons`;
