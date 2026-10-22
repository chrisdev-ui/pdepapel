-- Duración de los reels de Instagram, 2026-10-26. Aditiva: una columna nueva en SocialPost.
--   * durationCheckedAt: cuándo se intentó leer la duración del MP4 (lib/social/mp4-duration.ts).
--     Se llena también si falla, para no volver a intentarlo en cada sincronización.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de la fase B1:
--   npm run prod:approve -- "Duración de reels (20261026_add_social_post_duration_checked)"
--   npm run prod:migrate -- prisma/manual-migrations/20261026_add_social_post_duration_checked.sql --expect new
ALTER TABLE `SocialPost` ADD COLUMN `durationCheckedAt` DATETIME(3) NULL;
