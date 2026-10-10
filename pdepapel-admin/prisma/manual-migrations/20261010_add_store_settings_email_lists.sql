-- Dos listas de correos editables en Configuración, para que ninguna
-- dirección personal viva en el código (el repositorio es público):
--
--   excludedCustomerEmails   el equipo que no cuenta como clienta; se suma al
--                            correo de la tienda y al de relleno.
--   adminNotificationEmails  quién recibe los avisos del panel; vacía usa el
--                            correo de la tienda (Store.email).
--
-- Una dirección por línea. Nacen vacías: hasta que la dueña las llene, se
-- excluye solo el correo de la tienda y el de relleno, y los avisos van al
-- correo de la tienda.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('excludedCustomerEmails', 'adminNotificationEmails');

ALTER TABLE `StoreSettings`
  ADD COLUMN `excludedCustomerEmails`  TEXT NULL AFTER `botCasualVersion`,
  ADD COLUMN `adminNotificationEmails` TEXT NULL AFTER `excludedCustomerEmails`;

-- VERIFICACIÓN POSTERIOR (debe devolver 2):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('excludedCustomerEmails', 'adminNotificationEmails');
