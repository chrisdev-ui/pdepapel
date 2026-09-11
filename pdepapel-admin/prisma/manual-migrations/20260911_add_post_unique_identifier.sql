-- Una misma publicación de red social no puede registrarse dos veces en la
-- misma tienda (auditoría Grupo A, 2026-09-11). La API ya lo comprobaba con
-- findFirst + create; el índice cierra la carrera entre dos guardados a la vez.
--
-- `Shipping.box` pasa a `onDelete: Restrict` en el mismo cambio de esquema;
-- con relationMode = "prisma" eso lo emula el cliente de Prisma y no requiere
-- SQL (no hay llaves foráneas en la base de datos).
--
-- Verificación previa (debe devolver 0 filas):
--   SELECT storeId, social, postId, COUNT(*) FROM Post GROUP BY storeId, social, postId HAVING COUNT(*) > 1;

ALTER TABLE `Post` ADD UNIQUE INDEX `Post_storeId_social_postId_key` (`storeId`, `social`, `postId`);
