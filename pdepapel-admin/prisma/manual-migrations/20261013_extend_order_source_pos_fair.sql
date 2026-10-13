-- Origen del pedido (`Order.source`): se agregan POS (punto de venta) y FAIR
-- (feria) al enum que ya tenía PANEL, STORE y WHATSAPP. Solo agrega valores:
-- ninguna fila cambia (hoy todas tienen `source` NULL) y el código desplegado
-- sigue escribiendo valores que existen.
--
-- Se aplica ANTES de desplegar el código que escribe POS y FAIR.
--
-- VERIFICACIÓN PREVIA (debe mostrar enum('PANEL','STORE','WHATSAPP')):
--   SELECT COLUMN_TYPE FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'source';
--
-- VERIFICACIÓN POSTERIOR (debe mostrar enum('PANEL','STORE','WHATSAPP','POS','FAIR')):
--   la misma consulta.

-- AlterTable
ALTER TABLE `Order` MODIFY `source` ENUM('PANEL', 'STORE', 'WHATSAPP', 'POS', 'FAIR') NULL;
