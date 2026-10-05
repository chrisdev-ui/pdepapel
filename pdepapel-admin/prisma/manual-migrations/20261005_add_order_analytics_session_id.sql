-- 2026-10-05 · GA4: sesión de la compra (SEO ola 2, P1-8c)
--
-- Las compras llegan a GA4 por Measurement Protocol desde el panel con
-- client_id pero sin session_id, así que GA4 no las une a la sesión del
-- navegador y las atribuye a «Unassigned» / página de destino «(not set)»
-- (28 días al 2026-10-02: 100 % de los ingresos sin canal).
--
-- Solo añade una columna NULL: no reescribe filas, no bloquea la tabla más
-- allá del ALTER y es compatible con el código actual (que no la lee).
-- Aplicar ANTES de desplegar el código que la usa.

ALTER TABLE `Order`
  ADD COLUMN `analyticsSessionId` VARCHAR(32) NULL AFTER `analyticsClientId`;

-- Verificación:
--   SHOW COLUMNS FROM `Order` LIKE 'analyticsSessionId';
-- Reversión (si hiciera falta, después de revertir el código):
--   ALTER TABLE `Order` DROP COLUMN `analyticsSessionId`;
