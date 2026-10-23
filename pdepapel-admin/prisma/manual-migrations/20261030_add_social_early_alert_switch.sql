-- Interruptor de emergencia de la alerta temprana de redes, 2026-10-30. Aditiva: una columna con valor por defecto.
--   * StoreSettings.socialEarlyAlertEnabled (por defecto 1 = encendida). Cada red activa la alerta sola al juntar
--     10 publicaciones con lectura a las 2–6 h; esta columna solo sirve para pausarla desde el panel sin desplegar.
--   Una tienda sin fila en StoreSettings cuenta como encendida.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de la fase B3b:
--   npm run prod:approve -- "Interruptor de la alerta temprana (20261030_add_social_early_alert_switch)"
--   npm run prod:migrate -- prisma/manual-migrations/20261030_add_social_early_alert_switch.sql --expect new

ALTER TABLE `StoreSettings` ADD COLUMN `socialEarlyAlertEnabled` BOOLEAN NOT NULL DEFAULT true;

