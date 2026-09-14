-- Metadatos estructurados en los mensajes de conversación (2026-09-14).
--
-- Una clienta puede mandar un carrito desde el catálogo de WhatsApp. Ese
-- mensaje llega con `type: "order"` y trae los productos en
-- `order.product_items[]`, pero hoy se archiva con el cuerpo vacío y los
-- productos se pierden. Esta columna guarda esa parte tal cual llega.
--
-- Es aditiva y nula: los mensajes que ya existen quedan igual, y el código
-- anterior sigue funcionando sin leerla.
--
-- Verificación previa:
--   SHOW COLUMNS FROM `ConversationMessage` LIKE 'metadata'   -- sin filas
--   SELECT COUNT(*) FROM `ConversationMessage`                -- ~550
--
-- Verificación posterior:
--   SHOW COLUMNS FROM `ConversationMessage` LIKE 'metadata'   -- json, NULL permitido
--   SELECT COUNT(*) FROM `ConversationMessage` WHERE `metadata` IS NOT NULL  -- 0
--   SELECT COUNT(*) FROM `ConversationMessage`                -- el mismo de antes

ALTER TABLE `ConversationMessage`
  ADD COLUMN `metadata` JSON NULL;
