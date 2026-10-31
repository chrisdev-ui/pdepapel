-- Mercado Libre B1 (2026-10-30). Aditiva: cuatro columnas nuevas en StoreSettings, con valor por defecto o NULL.
-- Decisión de Christian (2026-10-30): el interruptor nace EN PAUSA. El código vivo no lee estas columnas, así que
-- nada cambia hasta el despliegue; desde ahí solo salen bajadas de stock y la pausa al quedar en cero.
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
    ADD COLUMN `mercadoLibreWritesPaused` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `mercadoLibreWritesPausedAt` DATETIME(3) NULL,
    ADD COLUMN `mercadoLibreWritesPausedBy` VARCHAR(191) NULL,
    ADD COLUMN `mercadoLibreAlertEmails` TEXT NULL;

UPDATE `StoreSettings`
    SET `mercadoLibreWritesPausedAt` = NOW(3), `mercadoLibreWritesPausedBy` = 'migración 20261110'
    WHERE `mercadoLibreWritesPaused` = true AND `mercadoLibreWritesPausedAt` IS NULL;

-- VERIFICACIÓN (solo lectura, como pdepapel_ro):
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = 'railway' AND TABLE_NAME = 'StoreSettings' AND COLUMN_NAME LIKE 'mercadoLibre%';
--   -- mercadoLibreAlertEmails text YES NULL · mercadoLibreWritesPaused tinyint(1) NO 1 ·
--   -- mercadoLibreWritesPausedAt datetime(3) YES NULL · mercadoLibreWritesPausedBy varchar(191) YES NULL
-- SELECT COUNT(*), SUM(`mercadoLibreWritesPaused`), SUM(`mercadoLibreWritesPausedAt` IS NOT NULL) FROM `StoreSettings`;
--   -- las tres cifras iguales: todas las tiendas en pausa y con fecha
