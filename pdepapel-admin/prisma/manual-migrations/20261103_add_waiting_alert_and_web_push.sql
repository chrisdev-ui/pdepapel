-- Bot: estabilidad y aviso de clientas esperando, 2026-10-27 (feat/bot-estabilidad-busqueda-2026-10-27). Aditiva: una
-- columna con default y una tabla nueva. Sin datos.
--   * StoreSettings.waitingAlertMinutes: minutos sin respuesta antes de avisar a la dueña (tarjeta de Inicio, número
--     de «Conversaciones» y aviso push). 30 por defecto.
--   * WebPushSubscription: los navegadores de la dueña que aceptaron avisos push del panel (endpoint y llaves del
--     estándar Web Push; nada de clientas).
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre `railway`.* y lee la tabla nueva sin otra línea. `copilot_ro` no recibe
-- nada: el Copiloto no necesita suscripciones push.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de esta rama: el código lee estas columnas.
--   npm run prod:approve -- "Aviso de clientas esperando y push (20261103_add_waiting_alert_and_web_push)"
--   npm run prod:migrate -- prisma/manual-migrations/20261103_add_waiting_alert_and_web_push.sql --expect new

ALTER TABLE `StoreSettings` ADD COLUMN `waitingAlertMinutes` INTEGER NOT NULL DEFAULT 30;

CREATE TABLE `WebPushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `endpointHash` VARCHAR(64) NOT NULL,
    `endpoint` TEXT NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `deviceLabel` VARCHAR(120) NULL,
    `lastSuccessAt` DATETIME(3) NULL,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WebPushSubscription_endpointHash_key`(`endpointHash`),
    INDEX `WebPushSubscription_storeId_idx`(`storeId`),
    INDEX `WebPushSubscription_storeId_userId_idx`(`storeId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- VERIFICACIÓN (solo lectura, como pdepapel_ro):
-- SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway'
--   AND TABLE_NAME = 'StoreSettings' AND COLUMN_NAME = 'waitingAlertMinutes';  -- 1
-- SELECT waitingAlertMinutes FROM `StoreSettings`;  -- 30
-- SELECT COUNT(*) FROM `WebPushSubscription`;  -- 0
