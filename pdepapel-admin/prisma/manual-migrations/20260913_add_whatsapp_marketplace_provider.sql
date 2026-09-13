-- Webhook de WhatsApp (2026-09-13): `MarketplaceProvider` gana el valor
-- WHATSAPP para guardar los eventos de la Cloud API (vía Dualhook) en
-- `MarketplaceWebhookEvent` con el mismo patrón que Mercado Libre.
--
-- El enum de Prisma es una columna ENUM por tabla en MySQL; las tres tablas
-- que lo usan se amplían. Añadir un valor al final no reescribe filas.
--
-- Verificación previa (deben devolver enum('MERCADOLIBRE')):
--   SELECT TABLE_NAME, COLUMN_TYPE FROM information_schema.columns
--   WHERE table_schema = DATABASE() AND column_name = 'provider'
--
-- Verificación posterior (deben devolver enum('MERCADOLIBRE','WHATSAPP')):
--   la misma consulta

ALTER TABLE `MarketplaceConnection`
  MODIFY `provider` ENUM('MERCADOLIBRE', 'WHATSAPP') NOT NULL;

ALTER TABLE `MarketplaceOAuthState`
  MODIFY `provider` ENUM('MERCADOLIBRE', 'WHATSAPP') NOT NULL;

ALTER TABLE `MarketplaceWebhookEvent`
  MODIFY `provider` ENUM('MERCADOLIBRE', 'WHATSAPP') NOT NULL;
