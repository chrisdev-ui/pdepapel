-- Permisos nuevos de `copilot_ro` para la habilidad «Kits para rotar inventario»
-- (lib/copiloto/skills/). El usuario ya existe en producción: este archivo
-- agrega lectura de las ofertas y escaleras de precio (precio efectivo, misma
-- regla que la tienda) y una vista con lo que el bot entendió que pedían por
-- WhatsApp. Lo corre Christian en la consola de MySQL de Railway con su
-- usuario administrador; no pasa por `prod:migrate` ni por Claude.
-- No hace falta redeploy: MySQL los aplica en la siguiente consulta.
-- Nada de datos de clientas: ni texto de mensajes, ni teléfonos, ni nombres.

-- Ofertas vigentes: tipo, monto y vigencia (sin el nombre interno).
GRANT SELECT (`id`, `storeId`, `label`, `type`, `amount`, `startDate`, `endDate`, `isActive`, `createdAt`) ON `railway`.`Offer` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `offerId`, `productId`) ON `railway`.`OfferProduct` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `offerId`, `categoryId`) ON `railway`.`OfferCategory` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `offerId`, `productGroupId`) ON `railway`.`OfferProductGroup` TO 'copilot_ro'@'%';

-- Precio por cantidad.
GRANT SELECT (`id`, `storeId`, `productId`, `minQuantity`, `unitPrice`) ON `railway`.`ProductPriceTier` TO 'copilot_ro'@'%';

-- Demanda por WhatsApp: solo lo que el bot anotó al contestar (tipo de
-- producto y personaje que entendió, cuántos productos encontró y cuáles
-- enseñó). La vista no expone el texto del mensaje, la búsqueda literal, el
-- teléfono ni la conversación; `copilot_ro` no recibe permiso sobre
-- ConversationMessage ni Conversation.
CREATE OR REPLACE SQL SECURITY DEFINER VIEW `railway`.`CopilotBotDemand` AS
SELECT
  m.`id` AS `id`,
  c.`storeId` AS `storeId`,
  m.`createdAt` AS `createdAt`,
  LOWER(JSON_UNQUOTE(JSON_EXTRACT(m.`metadata`, '$.decision.slots.productType'))) AS `productType`,
  LOWER(JSON_UNQUOTE(JSON_EXTRACT(m.`metadata`, '$.decision.slots.character'))) AS `characterName`,
  CAST(JSON_EXTRACT(m.`metadata`, '$.decision.total') AS SIGNED) AS `found`,
  JSON_EXTRACT(m.`metadata`, '$.shown.ids') AS `shownProductIds`
FROM `railway`.`ConversationMessage` m
JOIN `railway`.`Conversation` c ON c.`id` = m.`conversationId`
WHERE m.`sentBy` = 'BOT'
  AND JSON_CONTAINS_PATH(m.`metadata`, 'one', '$.decision', '$.shown');

GRANT SELECT ON `railway`.`CopilotBotDemand` TO 'copilot_ro'@'%';

-- VERIFICACIÓN (solo lectura): deben salir 5 tablas con 23 columnas y la vista.
-- SELECT TABLE_NAME, COUNT(*) FROM information_schema.COLUMN_PRIVILEGES
--  WHERE GRANTEE = "'copilot_ro'@'%'" AND TABLE_NAME IN ('Offer','OfferProduct','OfferCategory','OfferProductGroup','ProductPriceTier')
--  GROUP BY TABLE_NAME;
-- SELECT TABLE_NAME FROM information_schema.TABLE_PRIVILEGES
--  WHERE GRANTEE = "'copilot_ro'@'%'" AND TABLE_NAME = 'CopilotBotDemand';
-- SELECT COUNT(*) FROM `railway`.`CopilotBotDemand`;
