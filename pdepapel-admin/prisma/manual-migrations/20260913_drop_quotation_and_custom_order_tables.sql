-- Limpieza pendiente (2026-09-13): tablas huérfanas del retiro de cotizaciones.
--
-- El 2026-09-12 se retiró todo el código de plantillas de cotización, pedidos
-- personalizados (CustomOrder) y mensajes/plantillas de WhatsApp. Las tablas
-- quedaron definidas sin ninguna lectura ni escritura. En producción todas
-- están vacías; QuoteRequest se conserva (la ficha del pedido muestra las
-- solicitudes de cambio) y solo pierde la columna que apuntaba a CustomOrder.
--
-- No hay claves foráneas (relationMode = "prisma"), así que el orden de los
-- DROP es lógico, no obligatorio: primero las tablas hijas.
--
-- Verificación previa (cada consulta debe devolver 0; si alguna no lo hace,
-- NO aplicar y avisar):
--   SELECT COUNT(*) FROM `WhatsAppMessage`
--   SELECT COUNT(*) FROM `WhatsAppTemplate`
--   SELECT COUNT(*) FROM `CustomOrderItem`
--   SELECT COUNT(*) FROM `CustomOrder`
--   SELECT COUNT(*) FROM `QuotationItem`
--   SELECT COUNT(*) FROM `Quotation`
--   SELECT COUNT(*) FROM `QuoteRequest` WHERE `customOrderId` IS NOT NULL
--
-- Conteos en producción el 2026-09-12: WhatsAppMessage 0, WhatsAppTemplate 0,
-- CustomOrderItem 0, CustomOrder 0, QuotationItem 0, Quotation 0,
-- QuoteRequest 1 (sin customOrderId).
--
-- Verificación posterior:
--   SHOW TABLES LIKE 'Quotation%'         -- sin filas
--   SHOW TABLES LIKE 'CustomOrder%'       -- sin filas
--   SHOW TABLES LIKE 'WhatsApp%'          -- sin filas
--   SHOW COLUMNS FROM `QuoteRequest` LIKE 'customOrderId'   -- sin filas
--   SELECT COUNT(*) FROM `QuoteRequest`   -- 1 (la solicitud existente sigue)

DROP TABLE IF EXISTS `WhatsAppMessage`;

DROP TABLE IF EXISTS `WhatsAppTemplate`;

DROP TABLE IF EXISTS `CustomOrderItem`;

DROP TABLE IF EXISTS `CustomOrder`;

DROP TABLE IF EXISTS `QuotationItem`;

DROP TABLE IF EXISTS `Quotation`;

-- El índice único `QuoteRequest_customOrderId_key` cae con la columna.
ALTER TABLE `QuoteRequest` DROP COLUMN `customOrderId`;
