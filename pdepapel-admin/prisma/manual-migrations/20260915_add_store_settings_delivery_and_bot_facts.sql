-- Dos cosas para que el bot pueda contestar los datos del negocio.
--
-- 1. `deliveryEstimate`: cuánto tarda en llegar un pedido. Hoy ese texto vive
--    escrito a mano en `pdepapel-store/constants/index.ts` («2 a 4 días
--    hábiles»), donde el bot no puede leerlo porque corre en el panel. Pasa a
--    ser un dato y la tienda lo lee del mismo sitio.
--
--    El valor por defecto no es inventado: sobre 106 envíos con fecha real de
--    entrega, la mediana es 0,9 días, el 94 % llegó en 4 días o menos y el
--    100 % en 7. O sea que «2 a 4 días hábiles» es cierto y va algo sobrado,
--    que es como conviene prometer.
--
-- 2. `botFacts*`: el visto bueno de Paula a los textos con los que el bot
--    contesta. `botFactsVersion` guarda qué versión aprobó; si alguien cambia
--    un texto en el código, la versión deja de coincidir y el bot vuelve a
--    callarse esas respuestas hasta que ella las apruebe otra vez. Es la misma
--    idea del `approvedAt` de `WhatsAppBotReply`, que se borra al editar.
--
-- VERIFICACIÓN PREVIA (debe devolver 0 y 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('deliveryEstimate', 'botFactsApprovedAt',
--                          'botFactsApprovedBy', 'botFactsVersion');
--   SELECT COUNT(*) FROM `StoreSettings`;

ALTER TABLE `StoreSettings`
  ADD COLUMN `deliveryEstimate`   VARCHAR(191) NULL AFTER `freeShippingThreshold`,
  ADD COLUMN `botFactsApprovedAt` DATETIME(3)  NULL AFTER `botEnabled`,
  ADD COLUMN `botFactsApprovedBy` VARCHAR(191) NULL AFTER `botFactsApprovedAt`,
  ADD COLUMN `botFactsVersion`    VARCHAR(64)  NULL AFTER `botFactsApprovedBy`;

-- Si ya existiera alguna fila (Paula está llenando la pantalla justo ahora),
-- se le deja el texto verificado en vez de dejarlo vacío. Con la tabla vacía
-- esto no toca nada; se escribe igual para que aplicar la migración más tarde
-- dé el mismo resultado.

UPDATE `StoreSettings`
   SET `deliveryEstimate` = '2 a 4 días hábiles'
 WHERE `deliveryEstimate` IS NULL;

-- Columnas nuevas y opcionales: nada las lee hasta que despliegue el código,
-- así que se aplican antes del deploy, igual que las dos migraciones previas.
--
-- VERIFICACIÓN POSTERIOR (debe devolver 4, y 0 filas sin estimado):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('deliveryEstimate', 'botFactsApprovedAt',
--                          'botFactsApprovedBy', 'botFactsVersion');
--   SELECT COUNT(*) FROM `StoreSettings` WHERE `deliveryEstimate` IS NULL;
