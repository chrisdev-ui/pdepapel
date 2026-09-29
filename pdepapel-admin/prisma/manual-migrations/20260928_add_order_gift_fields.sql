-- Pedidos como regalo (2026-09-28).
--
-- Motivo: una clienta compró un regalo para otra persona y, como el pedido
-- solo tiene un correo, la confirmación con productos y precios le llegó a
-- quien recibía el regalo. El pedido necesita distinguir quién compra de
-- quién recibe.
--
-- `email`, `fullName`, `phone` y `documentId` NO cambian de significado: son
-- de quien compra (cuenta, beneficio de bienvenida, Clientes, DIAN, recibo
-- completo). Las columnas nuevas guardan a quien recibe: la transportadora
-- lleva su nombre y teléfono, y a su correo llega solo un aviso sin
-- productos, precios ni enlace del pedido, y solo cuando el pedido ya está
-- pagado.
--
-- PURAMENTE ADITIVA: una bandera con valor por defecto y cuatro columnas
-- opcionales. No toca datos existentes (todo pedido anterior queda como
-- «no es regalo») y el código anterior sigue funcionando. Aplicar en Railway
-- ANTES de desplegar el código que las lee: `findUnique` sin `select` trae
-- todas las columnas escalares y fallaría si no existen.

ALTER TABLE `Order`
  ADD COLUMN `isGift` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `giftRecipientName` VARCHAR(191) NULL,
  ADD COLUMN `giftRecipientEmail` VARCHAR(191) NULL,
  ADD COLUMN `giftRecipientPhone` VARCHAR(191) NULL,
  ADD COLUMN `giftMessage` TEXT NULL;
