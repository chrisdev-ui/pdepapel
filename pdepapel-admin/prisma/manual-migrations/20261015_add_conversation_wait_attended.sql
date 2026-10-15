-- «Marcar como atendido» y el interruptor del correo de esperas
-- (lib/whatsapp/waiting-list.ts, lib/whatsapp/waiting-reminder.ts):
--   * Conversation.waitAttendedAt / waitAttendedBy: Paula marca una espera como
--     atendida sin escribirle a la clienta; lo anterior a ese momento deja de
--     contar y la espera vuelve si la clienta escribe otra vez. Quién y cuándo.
--   * StoreSettings.waitingReminderEmail: «Avisarme por correo cuando un cliente
--     espere», apagado por defecto (Paula no lo quiso el 2026-10-15).
-- Solo agrega columnas. Sin llaves foráneas (relationMode = "prisma").
--
-- Se aplica ANTES de desplegar el código: `StoreSettings` se lee completo en
-- cada mensaje del bot y `Conversation` se actualiza sin `select`.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND ((TABLE_NAME = 'Conversation' AND COLUMN_NAME IN ('waitAttendedAt', 'waitAttendedBy'))
--        OR (TABLE_NAME = 'StoreSettings' AND COLUMN_NAME = 'waitingReminderEmail'));
--
-- VERIFICACIÓN POSTERIOR (debe devolver 3): la misma consulta.

-- AlterTable
ALTER TABLE `Conversation` ADD COLUMN `waitAttendedAt` DATETIME(3) NULL,
    ADD COLUMN `waitAttendedBy` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `StoreSettings` ADD COLUMN `waitingReminderEmail` BOOLEAN NOT NULL DEFAULT false;
