-- El bot, apagado por defecto también en la base de datos.
--
-- `getStoreSettings` y `saveStoreSettings` ya se arreglaron para que una tabla
-- vacía o un formulario que no mande la bandera dejen el bot APAGADO. Faltaba
-- el otro sitio donde vive la misma decisión: la columna se creó con
-- DEFAULT true, así que cualquier fila insertada sin nombrarla nacía con el
-- bot encendido. Es la misma trampa, una capa más abajo.
--
-- No cambia ninguna fila existente, solo lo que pasa con las nuevas.
--
-- VERIFICACIÓN PREVIA (debe devolver '1' y 0 filas):
--   SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME = 'botEnabled';
--   SELECT COUNT(*) FROM `StoreSettings`;

ALTER TABLE `StoreSettings`
  ALTER COLUMN `botEnabled` SET DEFAULT false;

-- VERIFICACIÓN POSTERIOR (debe devolver '0'):
--   SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME = 'botEnabled';
