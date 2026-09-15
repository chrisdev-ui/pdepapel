-- Las formas de pago dejan de ser un texto y pasan a ser un menú.
--
-- Esta misma noche se añadió `paymentMethodsInfo`: un solo campo con las tres
-- cuentas pegadas, que el bot mandaba de una sola vez. Paula lo quiere de otra
-- manera, y tiene razón: que la clienta toque cómo quiere pagar y vea SOLO lo
-- de esa forma, en vez de recibir un bloque con todo y buscar lo suyo dentro.
--
-- Eso pide campos separados, porque cada opción del menú enseña lo suyo y un
-- campo vacío significa «esa no la ofrecemos» —el menú ni la muestra—, cosa
-- que con un texto único no se puede saber.
--
-- Se puede reemplazar sin miedo: la columna vieja se creó hace unas horas,
-- nunca se llenó (está NULL) y ningún código desplegado la lee todavía. Por
-- eso se borra en vez de dejarla ahí estorbando. La verificación previa lo
-- comprueba antes de tocar nada: si alguien alcanzó a escribir algo, PARA y
-- cópialo a mano a los campos nuevos antes de seguir.
--
-- Como la otra, esta migración NO trae números. El repositorio es público y una
-- cuenta bancaria no se escribe en un archivo que cualquiera puede leer: los
-- valores los escribe Paula desde Configuración → Tienda.
--
-- VERIFICACIÓN PREVIA:
--   -- (a) debe devolver 1 (la columna vieja existe):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME = 'paymentMethodsInfo';
--   -- (b) debe devolver 0 (nadie la llenó; si devuelve 1 o más, PARA):
--   SELECT COUNT(*) FROM `StoreSettings`
--    WHERE `paymentMethodsInfo` IS NOT NULL AND TRIM(`paymentMethodsInfo`) <> '';
--   -- (c) debe devolver 0 (las nuevas todavía no existen):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('paymentCashInfo', 'paymentBancolombiaAccount',
--                          'paymentNequiNumber', 'paymentDaviplataNumber',
--                          'paymentCardInfo');

ALTER TABLE `StoreSettings`
  ADD COLUMN `paymentCashInfo`           TEXT NULL AFTER `deliveryEstimate`,
  ADD COLUMN `paymentBancolombiaAccount` TEXT NULL AFTER `paymentCashInfo`,
  ADD COLUMN `paymentNequiNumber`        TEXT NULL AFTER `paymentBancolombiaAccount`,
  ADD COLUMN `paymentDaviplataNumber`    TEXT NULL AFTER `paymentNequiNumber`,
  ADD COLUMN `paymentCardInfo`           TEXT NULL AFTER `paymentDaviplataNumber`;

ALTER TABLE `StoreSettings`
  DROP COLUMN `paymentMethodsInfo`;

-- Columnas nuevas y opcionales: nada las lee hasta que despliegue el código,
-- así que se aplica antes del deploy. Mientras estén vacías el bot no ofrece
-- esa forma de pago; si se quedan todas vacías, la pregunta le llega a Paula
-- como antes de que esto existiera.
--
-- VERIFICACIÓN POSTERIOR:
--   -- (a) debe devolver 5:
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME IN ('paymentCashInfo', 'paymentBancolombiaAccount',
--                          'paymentNequiNumber', 'paymentDaviplataNumber',
--                          'paymentCardInfo');
--   -- (b) debe devolver 0 (la vieja ya no está):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME = 'paymentMethodsInfo';
