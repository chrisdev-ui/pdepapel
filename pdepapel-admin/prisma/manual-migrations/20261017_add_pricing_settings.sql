-- Precios (habilidad «Precios» del Copiloto y calculadora de la ficha):
--   * Store.storeMinMarginPercent: margen bruto mínimo sobre el precio en la
--     tienda, en %. 35 por defecto (las tiendas existentes quedan en 35);
--     null = sin mínimo, y entonces nada se marca «por debajo del mínimo».
--   * Store.mercadoLibreLowPriceFixedFee y Store.mercadoLibreFreeShippingMin:
--     cargo fijo por unidad de Mercado Libre para productos de precio bajo y
--     precio desde el cual exige envío gratis, en COP. Vacíos hasta que
--     Christian los llene desde su cuenta; mientras tanto el Copiloto marca esas
--     líneas «estimado, sin cargo fijo».
--   * Category.markupOverridePercent: aumento sugerido definido por Paula para
--     la categoría; gana sobre la mediana calculada.
-- Solo agrega columnas. Sin llaves foráneas (relationMode = "prisma").
--
-- Se aplica ANTES de desplegar el código: el panel lee Store y Category completos.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND ((TABLE_NAME = 'Store' AND COLUMN_NAME IN ('storeMinMarginPercent', 'mercadoLibreLowPriceFixedFee', 'mercadoLibreFreeShippingMin'))
--        OR (TABLE_NAME = 'Category' AND COLUMN_NAME = 'markupOverridePercent'));
--
-- VERIFICACIÓN POSTERIOR (debe devolver 4): la misma consulta.
-- Y las tiendas quedan en 35: SELECT COUNT(*) FROM `Store` WHERE `storeMinMarginPercent` = 35;

-- AlterTable
ALTER TABLE `Store`
  ADD COLUMN `storeMinMarginPercent` DOUBLE NULL DEFAULT 35,
  ADD COLUMN `mercadoLibreLowPriceFixedFee` INTEGER NULL,
  ADD COLUMN `mercadoLibreFreeShippingMin` INTEGER NULL;

-- AlterTable
ALTER TABLE `Category`
  ADD COLUMN `markupOverridePercent` DOUBLE NULL;
