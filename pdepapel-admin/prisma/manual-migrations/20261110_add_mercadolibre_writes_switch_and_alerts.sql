-- Mercado Libre B1 (2026-10-30). Aditiva: cuatro columnas nuevas en StoreSettings, todas con valor por defecto
-- o NULL. Sin datos: ninguna fila cambia de comportamiento (el interruptor nace apagado = todo sigue igual).
--   * mercadoLibreWritesPaused / …PausedAt / …PausedBy: interruptor de emergencia. Encendido, no sale ninguna
--     escritura hacia Mercado Libre; la cola guarda lo pendiente y lo envía al apagarlo.
--   * mercadoLibreAlertEmails: destinatarios propios de las alertas de Mercado Libre (uno por línea). Vacía, las
--     alertas no se envían por correo (siguen en el panel); ya no usan la lista de avisos del panel.
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre `railway`.* y ve lo nuevo sin otra línea; `copilot_ro` no lee
-- StoreSettings.
--
-- Orden: se aplica ANTES del push (el panel nuevo lee y escribe estas columnas; el código vivo nunca las lee).
-- Lo corre Christian:
--   npm run prod:approve -- "Mercado Libre B1 (20261110_add_mercadolibre_writes_switch_and_alerts)"
--   npm run prod:migrate -- prisma/manual-migrations/20261110_add_mercadolibre_writes_switch_and_alerts.sql --expect new

ALTER TABLE `StoreSettings`
    ADD COLUMN `mercadoLibreWritesPaused` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mercadoLibreWritesPausedAt` DATETIME(3) NULL,
    ADD COLUMN `mercadoLibreWritesPausedBy` VARCHAR(191) NULL,
    ADD COLUMN `mercadoLibreAlertEmails` TEXT NULL;

-- VERIFICACIÓN (solo lectura, como pdepapel_ro):
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = 'railway' AND TABLE_NAME = 'StoreSettings' AND COLUMN_NAME LIKE 'mercadoLibre%';
--   -- mercadoLibreAlertEmails text YES NULL · mercadoLibreWritesPaused tinyint(1) NO 0 ·
--   -- mercadoLibreWritesPausedAt datetime(3) YES NULL · mercadoLibreWritesPausedBy varchar(191) YES NULL
-- SELECT COUNT(*) FROM `StoreSettings` WHERE `mercadoLibreWritesPaused` = true;  -- 0
