-- Reparto y origen de las fotos de grupos y variantes (#13, arregla #4).
--
-- `Image.scope`: reparto de una foto del grupo. `Image.origin`: OWN o
-- GROUP_COPY en fotos de variante; NULL = fila previa, cuenta como OWN.
-- Aditiva: dos columnas nulas, sin valor por defecto; ninguna fila cambia.
--
-- APLICAR ANTES DEL DEPLOY. Con el código nuevo y sin las columnas fallan el
-- guardado de grupos y fichas, la ficha y el grupo en el panel y los feeds de
-- Merchant y Meta (leen todas las columnas de `Image`). El catálogo público
-- no las nombra. El orden inverso es seguro.
--
--   npm run prod:migrate -- prisma/manual-migrations/20261008_add_image_scope_origin.sql --expect new
--
-- No es idempotente («Duplicate column name» si ya existe). SQL de `prisma
-- migrate diff` contra 93220e2f.

-- AlterTable
ALTER TABLE `Image` ADD COLUMN `origin` ENUM('OWN', 'GROUP_COPY') NULL,
    ADD COLUMN `scope` VARCHAR(191) NULL;

-- Verificación:
--   SHOW COLUMNS FROM `Image` WHERE Field IN ('origin', 'scope');
--   SELECT COUNT(*) FROM `Image` WHERE `origin` IS NOT NULL OR `scope` IS NOT NULL;  → 0
-- Reversión (después de revertir el código):
--   ALTER TABLE `Image` DROP COLUMN `origin`, DROP COLUMN `scope`;
