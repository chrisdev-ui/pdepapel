-- Identidad de una conversación de WhatsApp cuando Meta no manda el teléfono
-- (2026-09-21).
--
-- Desde que Meta admite nombres de usuario, el webhook **omite** `wa_id` de
-- quien tiene uno salvo que haya habido trato en 30 días o el contacto esté en
-- la libreta del negocio. En su lugar manda un BSUID (`user_id`,
-- `from_user_id`, `to_user_id`), con la forma `CO.2465629583926901`.
--
-- El código identificaba todo por teléfono, así que esos mensajes se
-- descartaban en silencio: 147 eventos de 8 contactos y 6 conversaciones de
-- venta completas que nunca aparecieron en el panel, respuestas de Paula
-- incluidas.
--
-- ESTA MIGRACIÓN **NO ES PURAMENTE ADITIVA**. Son tres cosas:
--   1. `phone` pasa de NOT NULL a NULL. Es una relajación: ninguna fila
--      cambia de valor y nada de lo que hoy escribe el código deja de valer,
--      porque todo lo que escribe hoy lleva teléfono. En MySQL 8 un
--      NOT NULL → NULL se hace copiando la tabla (ALGORITHM=COPY); con 60
--      filas es instantáneo.
--   2. `bsuid` y `username` se agregan, las dos nullable.
--   3. Un único por (storeId, channel, bsuid). En MySQL los NULL no chocan
--      entre sí en un índice único, así que las conversaciones sin BSUID
--      (todas las de hoy) conviven sin problema, igual que las que queden sin
--      teléfono en el único que ya existía.
--
-- Orden seguro: **esta migración va ANTES de desplegar el código**. El código
-- viejo no se entera (sigue escribiendo teléfono siempre) y el nuevo necesita
-- la columna. No hay ventana en la que una versión escriba algo que la otra no
-- pueda leer, así que no aplica el problema de expandir/contraer del menú de
-- pagos.
--
-- Cómo se aplica (desde pdepapel-admin, en una terminal de verdad):
--   npm run prod:approve -- "columna bsuid en Conversation y phone nullable"
--   npm run prod:migrate -- prisma/manual-migrations/20260921_add_conversation_bsuid.sql
--
-- Correrlo dos veces no rompe nada: el MODIFY deja la columna igual y el ADD
-- COLUMN / CREATE INDEX llevan IF NOT EXISTS.

ALTER TABLE `Conversation`
  MODIFY COLUMN `phone` VARCHAR(191) NULL;

ALTER TABLE `Conversation`
  ADD COLUMN IF NOT EXISTS `bsuid` VARCHAR(191) NULL;

-- El nombre de usuario (`@mrs_han14`) viene en `contacts[].profile.username` y
-- en estos contactos suele ser lo único legible: `profile.name` llega vacío.
-- Sin esto, la lista mostraría una fila sin teléfono y sin nombre.
ALTER TABLE `Conversation`
  ADD COLUMN IF NOT EXISTS `username` VARCHAR(191) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `Conversation_storeId_channel_bsuid_key`
  ON `Conversation` (`storeId`, `channel`, `bsuid`);

-- Verificación (las tres deben responder):
--   SHOW COLUMNS FROM Conversation LIKE 'phone';   -- Null = YES
--   SHOW COLUMNS FROM Conversation LIKE 'bsuid';    -- existe, Null = YES
--   SHOW COLUMNS FROM Conversation LIKE 'username'; -- existe, Null = YES
--   SHOW INDEX FROM Conversation WHERE Key_name = 'Conversation_storeId_channel_bsuid_key';
--
-- Para deshacerlo, solo mientras `bsuid` esté vacía en todas las filas y
-- ninguna conversación tenga `phone` NULL:
--   DROP INDEX `Conversation_storeId_channel_bsuid_key` ON `Conversation`;
--   ALTER TABLE `Conversation` DROP COLUMN `bsuid`;
--   ALTER TABLE `Conversation` DROP COLUMN `username`;
--   ALTER TABLE `Conversation` MODIFY COLUMN `phone` VARCHAR(191) NOT NULL;
--
-- Después de que el backfill reconstruya las 6 conversaciones perdidas ya no
-- se puede: esas filas no tienen teléfono, y devolver el NOT NULL las
-- rechazaría.
