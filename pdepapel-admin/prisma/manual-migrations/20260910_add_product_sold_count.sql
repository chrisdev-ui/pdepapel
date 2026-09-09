-- Orden «Más vendidos» en la tienda (rediseño de tienda y categorías, 2026-09).
-- Aplicar en Railway justo antes de desplegar el código que lo usa.
-- Aditivo: añade la columna con 0 y la rellena con las unidades de pedidos
-- pagados o enviados. El cron diario de ofertas la mantiene al día.

ALTER TABLE `Product` ADD COLUMN `soldCount` INT NOT NULL DEFAULT 0;
CREATE INDEX `Product_storeId_soldCount_idx` ON `Product`(`storeId`, `soldCount`);

UPDATE `Product` p
LEFT JOIN (
  SELECT oi.productId, SUM(oi.quantity) AS units
  FROM `OrderItem` oi
  INNER JOIN `Order` o ON o.id = oi.orderId
  WHERE oi.productId IS NOT NULL AND o.status IN ('PAID', 'SENT')
  GROUP BY oi.productId
) s ON s.productId = p.id
SET p.soldCount = COALESCE(s.units, 0);

-- Verificación:
-- SELECT COUNT(*) FROM Product WHERE soldCount > 0;
-- SELECT name, soldCount FROM Product ORDER BY soldCount DESC LIMIT 10;
