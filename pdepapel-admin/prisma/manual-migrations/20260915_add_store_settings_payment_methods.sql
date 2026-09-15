-- La séptima pregunta que el bot sabe contestar: cómo se paga.
--
-- Hoy Paula manda las formas de pago a mano, una por una, cada vez que se lo
-- preguntan. Pasa a ser un dato más de `StoreSettings`, como el horario o el
-- estimado de entrega, y el bot lo contesta con el mismo mecanismo: se lee de
-- aquí, nunca se inventa, y si está vacío la pregunta se le pasa a ella.
--
-- Se guarda SOLO la lista de cuentas, una por línea. El saludo de arriba y la
-- petición del comprobante los pone la plantilla del código, que Paula aprueba
-- aparte. TEXT y no VARCHAR porque son varias líneas y crecerán: hoy son tres
-- cuentas, mañana serán cuatro.
--
-- OJO: esta migración NO trae los números. Este repositorio es público, y una
-- cuenta bancaria no se escribe en un archivo que cualquiera puede leer. El
-- valor se carga aparte, directo contra la base, y se verifica con la consulta
-- del final.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME = 'paymentMethodsInfo';

ALTER TABLE `StoreSettings`
  ADD COLUMN `paymentMethodsInfo` TEXT NULL AFTER `deliveryEstimate`;

-- Columna nueva y opcional: nada la lee hasta que despliegue el código, así
-- que se puede aplicar antes del deploy sin romper lo que está corriendo.
-- Mientras esté vacía, el bot sigue pasándole esa pregunta a Paula.
--
-- VERIFICACIÓN POSTERIOR (debe devolver 1):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StoreSettings'
--      AND COLUMN_NAME = 'paymentMethodsInfo';
--
-- Y una vez cargado el valor (aparte), que esté completo y bien:
--   SELECT `paymentMethodsInfo` FROM `StoreSettings`
--    WHERE `storeId` = 'f23ee5bc-1f6f-4c10-9872-9e6217cc17fd';
