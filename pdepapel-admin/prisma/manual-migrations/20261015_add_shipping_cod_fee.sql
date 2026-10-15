-- Contra entrega: el recaudo de EnvioClick lo paga la clienta (decisión del
-- 2026-10-15). Se guarda en su propia columna, nunca dentro de `cost`, para
-- que el envío gratis siga siendo «Gratis» y los reportes, el panel, los
-- correos y la factura lo muestren aparte. `Order.total` lo incluye.
--
-- Compatible con el código desplegado: es una columna nueva, nullable, que
-- el código actual no lee. Se aplica ANTES del push, porque el código nuevo
-- la lee y la escribe.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Shipping' AND COLUMN_NAME = 'codFee';
--
-- VERIFICACIÓN POSTERIOR (debe devolver 1): la misma consulta.

-- AlterTable
ALTER TABLE `Shipping` ADD COLUMN `codFee` DOUBLE NULL;
