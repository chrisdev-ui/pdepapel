-- Canal de venta de los pedidos, reembolso de contra entrega en GA4 y caché de cotizaciones contra entrega (2026-11-02). Aditiva:
--   * Order.salesChannel: por dónde llegó la clienta (WhatsApp, Instagram, TikTok, Presencial, Feria, Otro). Lo elige
--     la dueña al crear un pedido en el panel; WhatsApp, punto de venta y ferias lo ponen solos. Null en lo anterior y
--     en la tienda en línea.
--   * Order.analyticsRefundTrackedAt: el `refund` de GA4 de un pedido contra entrega cancelado antes de entregar ya
--     salió. Una sola vez, aunque el pedido se reactive.
--   * ShippingQuote: isCOD, codAmount y codFreeShipping entran en la llave única, para que la cotización contra entrega
--     use la caché sin servir el recaudo de otro carrito. La tabla tiene 0 filas en producción (2026-11-02): la tienda
--     siempre cotiza contra entrega y hasta hoy esa cotización no se guardaba.
--     El nombre del índice viejo es el truncado que dejó `prisma db push` (leído en producción con pdepapel_ro).
--
-- Orden: se aplica ANTES del push. El código vivo no lee ni escribe las columnas nuevas; las escrituras de la caché
-- (solo cotizaciones prepagadas desde el panel) siguen funcionando con los valores por defecto.
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre la tabla entera. `copilot_ro` tiene SELECT por columna en `Order` y no
-- necesita las nuevas.
--
-- Lo corre Christian:
--   npm run prod:approve -- "Canal de venta y caché contra entrega (20261113_add_order_sales_channel_and_cod_quote_cache)"
--   npm run prod:migrate -- prisma/manual-migrations/20261113_add_order_sales_channel_and_cod_quote_cache.sql --expect new

ALTER TABLE `Order`
    ADD COLUMN `salesChannel` ENUM('WHATSAPP', 'INSTAGRAM', 'TIKTOK', 'PRESENCIAL', 'FERIA', 'OTRO') NULL,
    ADD COLUMN `analyticsRefundTrackedAt` DATETIME(3) NULL;

ALTER TABLE `ShippingQuote`
    ADD COLUMN `isCOD` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `codAmount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `codFreeShipping` BOOLEAN NOT NULL DEFAULT false,
    DROP INDEX `ShippingQuote_storeId_originDaneCode_destDaneCode_weight_dec_key`,
    ADD UNIQUE INDEX `ShippingQuote_quote_cache_key` (`storeId`, `originDaneCode`, `destDaneCode`, `weight`, `declaredValue`, `isCOD`, `codAmount`, `codFreeShipping`);

-- VERIFICACIÓN (solo lectura, con pdepapel_ro):
--   SHOW COLUMNS FROM `Order` WHERE Field IN ('salesChannel', 'analyticsRefundTrackedAt');  -- 2 filas
--   SHOW INDEX FROM `ShippingQuote` WHERE Key_name = 'ShippingQuote_quote_cache_key';      -- 8 filas
--   SHOW INDEX FROM `ShippingQuote` WHERE Key_name LIKE '%weight_dec_key';                 -- 0 filas
