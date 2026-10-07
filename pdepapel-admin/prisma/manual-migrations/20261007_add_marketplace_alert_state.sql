-- Estado de las alertas de salud de Mercado Libre (issue #8, 2026-10-07).
--
-- Motivo: el aviso diario «[Mercado Libre] N revisiones pendientes» salía en
-- cada corrida con las mismas alertas (unas 33 veces en 30 días, dos por día
-- cuando el flujo se lanzaba a mano), y en el panel no había cómo marcarlas
-- como revisadas. Esta tabla guarda, por alerta, la huella que ya se avisó
-- y la que alguien marcó como revisada: el correo solo sale con lo nuevo o
-- lo que cambió, y lo revisado queda callado hasta que su huella cambie.
--
-- PURAMENTE ADITIVA: una tabla nueva, sin tocar ninguna existente. Sin
-- claves foráneas (relationMode = "prisma"); los índices son los que declara
-- el esquema.
--
-- APLICAR EN RAILWAY ANTES DE DESPLEGAR EL CÓDIGO QUE LA USA. Con el código
-- nuevo y sin la tabla:
--   - el cron `mercadolibre-health` falla (JobRun en rojo) y no manda aviso;
--   - `GET /marketplaces/mercadolibre/health` responde 500 y el resumen de
--     Mercado Libre del panel no carga.
-- El orden inverso es seguro: el cliente Prisma anterior nunca la nombra.
--
-- Aplicar (aprobación de Christian, token fresco):
--   npm run prod:migrate -- prisma/manual-migrations/20261007_add_marketplace_alert_state.sql --expect new
--
-- No es idempotente: si la tabla ya existe, MySQL responde «Table
-- 'MarketplaceAlertState' already exists» y no cambia nada.
--
-- El SQL es exactamente el de `prisma migrate diff` contra el esquema de
-- 758ab1d4.

-- CreateTable
CREATE TABLE `MarketplaceAlertState` (
    `id` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `alertKey` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `fingerprint` VARCHAR(64) NOT NULL,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `lastNotifiedAt` DATETIME(3) NULL,
    `notifiedFingerprint` VARCHAR(64) NULL,
    `dismissedAt` DATETIME(3) NULL,
    `dismissedFingerprint` VARCHAR(64) NULL,
    `dismissedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MarketplaceAlertState_connectionId_idx`(`connectionId`),
    INDEX `MarketplaceAlertState_connectionId_resolvedAt_idx`(`connectionId`, `resolvedAt`),
    UNIQUE INDEX `MarketplaceAlertState_connectionId_alertKey_key`(`connectionId`, `alertKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verificación:
--   SHOW CREATE TABLE `MarketplaceAlertState`;
--     → las 15 columnas, PRIMARY KEY (id), UNIQUE (connectionId, alertKey) y los dos índices
--   SELECT COUNT(*) FROM `MarketplaceAlertState`;
--     → 0 (la llena la primera corrida de `mercadolibre-health` después del deploy)
--
-- Reversión (solo después de revertir el código que la usa):
--   DROP TABLE `MarketplaceAlertState`;
-- Se pierde solo el historial de avisos y revisiones; la corrida siguiente
-- volvería a avisar las alertas abiertas una vez.
