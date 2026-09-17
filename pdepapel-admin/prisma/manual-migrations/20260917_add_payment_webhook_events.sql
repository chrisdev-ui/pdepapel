-- Cada llamada de Bold y Wompi al webhook de pagos, incluidas las rechazadas
-- (2026-09-17). Hasta hoy un pago procesado dejaba rastro en el pedido, pero
-- una firma inválida, un pedido no encontrado o un monto que no cuadraba sólo
-- dejaban un `console.warn` en Vercel. Mismo patrón que MarketplaceWebhookEvent
-- para Mercado Libre y WhatsApp.
--
-- Aditivo: una tabla nueva, ninguna columna existente cambia. Aplicar en
-- Railway justo antes de desplegar el código que la escribe; si el código
-- llega primero, cada webhook de pago fallará al registrarse (se traga el
-- error y el pago sigue), pero no quedará rastro hasta que exista la tabla.
--
-- La fila se escribe con status RECEIVED antes de verificar la firma y se
-- cierra con el resultado. No hay índice único a propósito: cada entrega es
-- una fila, también las repetidas.

CREATE TABLE `PaymentWebhookEvent` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NULL,
  `provider` ENUM('BOLD', 'WOMPI') NOT NULL,
  `eventType` VARCHAR(191) NULL,
  `transactionId` VARCHAR(191) NULL,
  `orderReference` VARCHAR(191) NULL,
  `orderId` VARCHAR(191) NULL,
  `statusCode` INTEGER NULL,
  `status` ENUM('RECEIVED', 'PROCESSED', 'IGNORED', 'REJECTED', 'FAILED') NOT NULL DEFAULT 'RECEIVED',
  `rawBody` TEXT NOT NULL,
  `signature` VARCHAR(191) NULL,
  `payload` JSON NULL,
  `error` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `PaymentWebhookEvent_storeId_status_createdAt_idx` (`storeId`, `status`, `createdAt`),
  INDEX `PaymentWebhookEvent_provider_transactionId_idx` (`provider`, `transactionId`),
  INDEX `PaymentWebhookEvent_orderId_idx` (`orderId`),
  INDEX `PaymentWebhookEvent_status_completedAt_idx` (`status`, `completedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verificación:
-- SELECT COUNT(*) FROM PaymentWebhookEvent;
-- SHOW INDEX FROM PaymentWebhookEvent;
