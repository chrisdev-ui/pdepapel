-- Permisos nuevos de `copilot_ro` para la herramienta «productosParaPromocionar»
-- (lib/copiloto/tools.ts). El usuario ya existe en producción: este archivo
-- solo agrega dos GRANT. Lo corre Christian en la consola de MySQL de Railway,
-- con su usuario administrador; no pasa por `prod:migrate` ni por Claude.
-- Las mismas líneas ya están en 20261010_create_copilot_ro_user.sql.
--
-- Sin estos permisos la herramienta responde «sin_permiso» y el copiloto dice
-- que no pudo consultar; nada más se rompe. No hace falta redeploy: MySQL los
-- aplica en la siguiente consulta.

-- Cuántas fotos tiene cada producto (solo el id y el producto, no la URL).
GRANT SELECT (`id`, `productId`) ON `railway`.`Image` TO 'copilot_ro'@'%';

-- Los tres umbrales de campaña de Crecimiento; nada de las reservas de caja.
GRANT SELECT (`id`, `storeId`, `minimumCampaignMarginPct`, `minimumCampaignStock`, `minimumCampaignDaysCover`)
  ON `railway`.`BusinessCashPolicy` TO 'copilot_ro'@'%';

-- VERIFICACIÓN: SHOW GRANTS FOR 'copilot_ro'@'%';  (deben aparecer las dos líneas)
-- VUELTA ATRÁS:
--   REVOKE SELECT (`id`, `productId`) ON `railway`.`Image` FROM 'copilot_ro'@'%';
--   REVOKE SELECT (`id`, `storeId`, `minimumCampaignMarginPct`, `minimumCampaignStock`, `minimumCampaignDaysCover`)
--     ON `railway`.`BusinessCashPolicy` FROM 'copilot_ro'@'%';
