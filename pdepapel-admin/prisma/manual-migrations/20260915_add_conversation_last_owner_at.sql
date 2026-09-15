-- Cuándo escribió Paula por última vez en cada conversación.
--
-- El bot no tenía forma de saber si una persona estaba llevando el hilo:
-- `lastOutboundAt` lo mueven tanto él como ella, así que no distingue quién
-- habló. El resultado fue que se metía en medio de conversaciones suyas, y el
-- parche del mismo día (c4b2caa) lo arregló a lo bruto, callando al bot PARA
-- SIEMPRE en cualquier hilo donde ella hubiera escrito alguna vez.
--
-- Con esta columna el freno pasa a ser una ventana de 24 h: el bot se calla
-- mientras ella esté encima de la conversación y vuelve cuando el hilo se
-- enfría de verdad.
--
-- VERIFICACIÓN PREVIA (debe devolver 0, 25 y 14):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Conversation'
--      AND COLUMN_NAME = 'lastOwnerAt';
--   SELECT COUNT(*) FROM `Conversation`;
--   SELECT COUNT(DISTINCT `conversationId`) FROM `ConversationMessage`
--    WHERE `sentBy` = 'OWNER';

ALTER TABLE `Conversation`
  ADD COLUMN `lastOwnerAt` DATETIME(3) NULL AFTER `lastOutboundAt`;

-- Relleno: sin esto, al desplegar el código nuevo TODA conversación quedaría
-- con `lastOwnerAt` NULL, o sea «aquí no ha hablado nadie», y el bot entraría
-- de golpe en los 14 hilos que el parche tiene callados —incluido el de la
-- proveedora, donde Paula estaba negociando minutos antes—. Se copia la fecha
-- del último mensaje suyo de verdad, que es el dato que la ventana necesita.
--
-- `updatedAt` no se toca: Prisma lo escribe desde la aplicación, la columna no
-- lleva ON UPDATE, así que este UPDATE no la mueve.

UPDATE `Conversation` c
  JOIN (
    SELECT `conversationId`, MAX(`createdAt`) AS `ultimo`
      FROM `ConversationMessage`
     WHERE `sentBy` = 'OWNER'
     GROUP BY `conversationId`
  ) m ON m.`conversationId` = c.`id`
   SET c.`lastOwnerAt` = m.`ultimo`;

-- Columna nueva y opcional: hasta que despliegue el código nadie la lee, así
-- que se aplica antes del deploy sin romper nada, igual que StoreSettings.
--
-- VERIFICACIÓN POSTERIOR (debe devolver 1, 14 y 11):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Conversation'
--      AND COLUMN_NAME = 'lastOwnerAt';
--   SELECT COUNT(*) FROM `Conversation` WHERE `lastOwnerAt` IS NOT NULL;
--   SELECT COUNT(*) FROM `Conversation` WHERE `lastOwnerAt` IS NULL;
--
-- Y que ninguna fecha se haya inventado (debe devolver 0):
--   SELECT COUNT(*) FROM `Conversation` c
--    WHERE c.`lastOwnerAt` IS NOT NULL
--      AND c.`lastOwnerAt` <> (SELECT MAX(m.`createdAt`)
--                                FROM `ConversationMessage` m
--                               WHERE m.`conversationId` = c.`id`
--                                 AND m.`sentBy` = 'OWNER');
