-- Auditoría de reposición (2026-09-12): pedidos pagados sin `paidAt`.
--
-- Antes del despliegue del 2026-09-10, el formulario de Pedidos creaba ventas
-- por transferencia ya en PAID sin escribir `paidAt`. Inventario mide las
-- ventas de 30 y 90 días por `paidAt`, así que esos pedidos no cuentan: en
-- producción son 179 de 687 pedidos pagados (16 de los 20 del último mes).
--
-- La fecha de pago real es el momento en que el pedido descontó inventario:
-- el primer movimiento ORDER_PLACED que lo referencia (23 de los 179). Los
-- demás nacieron pagados en el formulario, así que su creación es el pago;
-- `updatedAt` no sirve porque un envío o una edición posterior lo mueven.
--
-- Verificación previa (debe devolver 179 en producción el 2026-09-12):
--   SELECT COUNT(*) FROM `Order` WHERE `status` IN ('PAID','SENT') AND `paidAt` IS NULL
--
-- Verificación posterior (debe devolver 0):
--   SELECT COUNT(*) FROM `Order` WHERE `status` IN ('PAID','SENT') AND `paidAt` IS NULL

UPDATE `Order` AS o
LEFT JOIN (
  SELECT `referenceId`, MIN(`createdAt`) AS `movedAt`
  FROM `InventoryMovement`
  WHERE `type` = 'ORDER_PLACED' AND `referenceId` IS NOT NULL
  GROUP BY `referenceId`
) AS m ON m.`referenceId` = o.`id`
SET o.`paidAt` = COALESCE(m.`movedAt`, o.`createdAt`)
WHERE o.`status` IN ('PAID', 'SENT') AND o.`paidAt` IS NULL;
