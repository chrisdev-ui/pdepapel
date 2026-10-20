-- Cápsulas P2 (2026-10-22): la reserva de caja/empaque de cada pack pasa a
-- `CapsulePackOption`, junto al tope del regalo. Antes eran constantes en
-- `lib/pricing/capsules.ts`; son cifras del negocio y se configuran por
-- edición. Aditiva: una columna con valor por defecto.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de P2:
--   npm run prod:approve -- "Reserva de caja por pack de cápsulas (20261022_add_capsule_pack_box_reserve)"
--   npm run prod:migrate -- prisma/manual-migrations/20261022_add_capsule_pack_box_reserve.sql --expect new

ALTER TABLE `CapsulePackOption` ADD COLUMN `boxReserveCost` DOUBLE NOT NULL DEFAULT 0;
