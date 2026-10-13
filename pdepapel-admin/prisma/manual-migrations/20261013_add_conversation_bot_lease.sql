-- Turno de envío del bot por conversación (lib/whatsapp/bot-lease.ts): antes
-- de mandar algo, una corrida del bot se queda con el turno hasta
-- `botLeaseUntil` (45 s) en una sola sentencia condicional y lo suelta al
-- terminar. Así dos mensajes de la misma clienta procesados a la vez no
-- reciben dos respuestas. Solo agrega una columna que puede quedar vacía: las
-- conversaciones existentes quedan sin turno tomado. Sin llaves foráneas
-- (relationMode = "prisma").
--
-- Se aplica ANTES de desplegar el código: la columna se lee en cada envío.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME = 'Conversation' AND COLUMN_NAME = 'botLeaseUntil';
--
-- VERIFICACIÓN POSTERIOR (debe devolver 1): la misma consulta.

-- AlterTable
ALTER TABLE `Conversation` ADD COLUMN `botLeaseUntil` DATETIME(3) NULL;
