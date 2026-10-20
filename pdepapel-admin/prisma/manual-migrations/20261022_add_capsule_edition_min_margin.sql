-- Cápsulas (2026-10-22): piso del P95 por edición. Nullable y sin valor por
-- defecto: sin valor, «Guardar packs» e imprimir siguen usando el margen mínimo
-- de la tienda (`Store.storeMinMarginPercent`). Paula lo fija en el taller de
-- la edición. Aditiva.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de P3:
--   npm run prod:approve -- "Piso de margen por edición de cápsulas (20261022_add_capsule_edition_min_margin)"
--   npm run prod:migrate -- prisma/manual-migrations/20261022_add_capsule_edition_min_margin.sql --expect new

ALTER TABLE `CapsuleEdition` ADD COLUMN `minMarginPct` DOUBLE NULL;
