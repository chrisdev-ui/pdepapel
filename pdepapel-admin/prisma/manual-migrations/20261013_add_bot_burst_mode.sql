-- Modo ráfaga del bot de WhatsApp (lib/whatsapp/burst.ts): un interruptor por
-- tienda, apagado por defecto, y la decisión que habría tomado ese modo junto
-- a cada fila del modo sombra (solo tamaños, posición e intenciones; nunca
-- texto de clientas). Solo agrega columnas: las filas existentes quedan con
-- el interruptor apagado y sin decisión. Sin llaves foráneas
-- (relationMode = "prisma").
--
-- Se aplica ANTES de desplegar el código: `StoreSettings` se lee completo en
-- cada mensaje del bot.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND ((TABLE_NAME = 'StoreSettings' AND COLUMN_NAME = 'botReadBursts')
--        OR (TABLE_NAME = 'WhatsAppBotShadowRun' AND COLUMN_NAME = 'burstDecision'));
--
-- VERIFICACIÓN POSTERIOR (debe devolver 2):
--   la misma consulta.

-- AlterTable
ALTER TABLE `StoreSettings` ADD COLUMN `botReadBursts` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `WhatsAppBotShadowRun` ADD COLUMN `burstDecision` JSON NULL;
