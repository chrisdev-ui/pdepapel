-- Elimina las tablas de portada antiguas (rediseño de la portada, 2026-09).
-- Aplicar en Railway DESPUÉS de que el despliegue con `HomeContent` esté en
-- producción y de comprobar la portada, nunca antes: el código anterior las
-- lee y fallaría sin ellas.
-- Antes de aplicar, comprobar que la copia existe:
--   SELECT COUNT(*) FROM HomeContent;
--   SELECT COUNT(*) FROM Billboard; SELECT COUNT(*) FROM MainBanner; SELECT COUNT(*) FROM Banner;

DROP TABLE IF EXISTS `Banner`;
DROP TABLE IF EXISTS `MainBanner`;
DROP TABLE IF EXISTS `Billboard`;
