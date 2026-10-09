-- Perfiles rápidos aprendidos (#22): cada subcategoría recuerda las categorías
-- de Mercado Libre con que se publicó. Un perfil aprendido empieza «sugerido»
-- y se aplica solo después del primer «Usar esta».
--
-- Aditiva: dos columnas NOT NULL con valor por defecto y una JSON opcional.
-- Los perfiles existentes quedan MANUAL y ACCEPTED: se siguen aplicando igual.
--
-- APLICAR ANTES DEL DEPLOY: el código nuevo lee estas columnas en Mercado
-- Libre y en Configuración.
--
--   npm run prod:migrate -- prisma/manual-migrations/20261009_add_publication_profile_learning.sql --expect new

ALTER TABLE `MarketplacePublicationProfile`
  ADD COLUMN `origin` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN `state` VARCHAR(16) NOT NULL DEFAULT 'ACCEPTED',
  ADD COLUMN `candidates` JSON NULL;

-- Verificación:
--   SHOW COLUMNS FROM `MarketplacePublicationProfile` WHERE Field IN ('origin', 'state', 'candidates');
--   SELECT COUNT(*) FROM `MarketplacePublicationProfile` WHERE `origin` <> 'MANUAL' OR `state` <> 'ACCEPTED';  → 0
-- Reversión (después de revertir el código):
--   ALTER TABLE `MarketplacePublicationProfile` DROP COLUMN `origin`, DROP COLUMN `state`, DROP COLUMN `candidates`;
