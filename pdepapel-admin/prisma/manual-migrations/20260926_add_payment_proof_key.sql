-- Comprobante de pago en las ventas de feria (2026-09-26).
--
-- Motivo: en la feria Paula cobra por transferencia y la clienta le muestra
-- la pantalla del banco. Hasta ahora solo quedaba la referencia escrita a
-- mano; si el número venía mal, no había con qué cotejar el pago después.
-- Ahora la venta puede llevar una foto o captura del comprobante.
--
-- La columna guarda la CLAVE del objeto en el bucket privado de Cloudflare R2
-- (`comprobantes/<storeId>/<uuid>.<jpg|png|webp>`), no una URL: el bucket no
-- tiene acceso público y el panel solo entrega la imagen leyendo el objeto
-- con las credenciales del servidor, por una ruta con sesión de dueña
-- (/api/[storeId]/orders/[orderId]/payment-proof). La captura contiene
-- nombre, banco y parte de la cuenta de la clienta: nunca se guarda ni se
-- muestra como imagen pública, y no pasa por Cloudinary.
--
-- PURAMENTE ADITIVA: una columna opcional. No toca datos existentes y el
-- código anterior sigue funcionando (nunca la lee). Aplicar en Railway ANTES
-- de desplegar el código que la lee: `include: { payment: true }` selecciona
-- todas las columnas escalares y fallaría si la columna no existe.

ALTER TABLE `PaymentDetails`
  ADD COLUMN `proofKey` VARCHAR(191) NULL;
