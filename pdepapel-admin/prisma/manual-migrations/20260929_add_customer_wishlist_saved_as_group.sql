-- Favoritos guardados como familia (2026-09-29).
--
-- Motivo: el corazón de una tarjeta de grupo guarda la familia entera, pero
-- la fila de favoritos de la cuenta solo sabía el id de la variante que le
-- ponía cara ese día, así que al volver a cargar la página (o en otro
-- dispositivo) la familia aparecía como esa variante con «Agregar al
-- carrito» en vez de como grupo con «Elegir opción». `savedAsGroup` guarda
-- la intención: `productId` sigue siendo la variante representante y la
-- tienda refresca la familia por su grupo.
--
-- PURAMENTE ADITIVA: una columna con valor por defecto. Las filas existentes
-- quedan en `false` (ninguna se guardó como familia antes de este cambio).
-- Aplicar en Railway ANTES de desplegar el código que la lee.

-- AlterTable
ALTER TABLE `CustomerWishlistItem` ADD COLUMN `savedAsGroup` BOOLEAN NOT NULL DEFAULT false;
