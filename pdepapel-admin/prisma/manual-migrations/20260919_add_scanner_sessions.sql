-- Escáner remoto: un celular vinculado como lector de una pantalla del panel
-- (2026-09-19). Dos tablas nuevas: la sesión de vinculación (código corto,
-- tienda, quién la abrió, quién la vinculó, token del celular vinculado,
-- vencimiento a 10 minutos sin actividad) y cada lectura enviada.
--
-- Aditivo y trivialmente reversible: no cambia ninguna columna ni enum
-- existente; revertir es `DROP TABLE ScannerScan, ScannerSession`. Aplicar en
-- Railway antes de desplegar el código; si el código llega primero, el botón
-- «Usar el celular como escáner» falla al crear la sesión y el resto del
-- panel sigue igual.
--
-- Sin cron de limpieza en esta versión: lo vencido deja de servir al
-- consultarlo. Si la tabla crece, una purga periódica es el siguiente paso.

CREATE TABLE `ScannerSession` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `pairedUserId` VARCHAR(191) NULL,
  `pairingToken` VARCHAR(191) NULL,
  `deviceLabel` VARCHAR(191) NULL,
  `pairedAt` DATETIME(3) NULL,
  `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `ScannerSession_storeId_code_key`(`storeId`, `code`),
  INDEX `ScannerSession_storeId_expiresAt_idx`(`storeId`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ScannerScan` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ScannerScan_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
