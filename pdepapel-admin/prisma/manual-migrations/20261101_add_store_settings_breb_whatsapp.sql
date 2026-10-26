-- Llave Bre-B y WhatsApp del negocio en la configuración de la tienda, 2026-10-26. Aditiva: dos columnas que admiten NULL.
--   * StoreSettings.paymentBreBKey: la llave Bre-B para transferir.
--   * StoreSettings.whatsappNumber: el WhatsApp del negocio en dígitos con indicativo (57…).
-- La página del pedido, el checkout y el correo de «Pendiente de pago» de una transferencia leen de aquí (F6). Sin datos
-- en este archivo: los valores se copian aparte con prod:write desde los que hoy muestra /pedido.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de esta rama: el código lee estas columnas.
--   npm run prod:approve -- "Bre-B y WhatsApp en la configuración (20261101_add_store_settings_breb_whatsapp)"
--   npm run prod:migrate -- prisma/manual-migrations/20261101_add_store_settings_breb_whatsapp.sql --expect new

ALTER TABLE `StoreSettings`
  ADD COLUMN `paymentBreBKey` TEXT NULL,
  ADD COLUMN `whatsappNumber` VARCHAR(20) NULL;
