-- Publicaciones promocionadas y duración manual de reels, 2026-10-31. Aditiva: cinco columnas que admiten NULL.
--   * SocialPost.promotion (PROMOTED | NOT_PROMOTED | NULL = sin decidir), promotionSource (MANUAL | AUTO) y
--     promotionSetAt. La dueña decide en el detalle y su decisión siempre gana; la sincronización solo escribe
--     PROMOTED/AUTO mientras Instagram lista un anuncio activo de la publicación (`boost_ads_list`) y nunca lo borra.
--     Una publicación PROMOTED sale de las medianas, «× mediana», «Qué funciona», «Mejor horario», la alerta
--     temprana y el resumen semanal (las vistas de la API son solo orgánicas).
--   * SocialPost.totalViews: `total_views_count` de Instagram (orgánicas + promocionadas + repeticiones). Con más
--     de 2× las orgánicas y más de 500 se sugiere «¿Promocionado?»; la sugerencia no excluye nada hasta confirmar.
--   * SocialPost.durationManualSec: la duración que escribe la dueña cuando Instagram no entrega el video
--     (audio con derechos: sin `media_url`). La leída del video gana.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de esta rama: el código lee estas columnas.
--   npm run prod:approve -- "Promoción y duración manual en redes (20261031_add_social_promotion_and_manual_duration)"
--   npm run prod:migrate -- prisma/manual-migrations/20261031_add_social_promotion_and_manual_duration.sql --expect new

ALTER TABLE `SocialPost`
  ADD COLUMN `durationManualSec` DOUBLE NULL,
  ADD COLUMN `totalViews` INT NULL,
  ADD COLUMN `promotion` ENUM('PROMOTED', 'NOT_PROMOTED') NULL,
  ADD COLUMN `promotionSource` ENUM('MANUAL', 'AUTO') NULL,
  ADD COLUMN `promotionSetAt` DATETIME(3) NULL;
