-- Copiloto v1 (docs/design/asistente-experto-paula.md): conversaciones,
-- mensajes con su uso y costo, y las correcciones y aprobaciones de Paula a
-- las notas de conocimiento. Tablas nuevas y vacías: no tocan nada existente.
-- Sin llaves foráneas (relationMode = "prisma"); cada relación lleva su índice.
--
-- VERIFICACIÓN PREVIA (debe devolver 0):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME IN ('AssistantConversation', 'AssistantMessage', 'AssistantKnowledgeNote');

-- CreateTable
CREATE TABLE `AssistantConversation` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssistantConversation_storeId_userId_lastMessageAt_idx`(`storeId`, `userId`, `lastMessageAt`),
    INDEX `AssistantConversation_storeId_idx`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssistantMessage` (
    `id` VARCHAR(64) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `parts` JSON NOT NULL,
    `model` VARCHAR(64) NULL,
    `inputTokens` INTEGER NULL,
    `cachedInputTokens` INTEGER NULL,
    `outputTokens` INTEGER NULL,
    `costUsd` DECIMAL(10, 6) NULL,
    `latencyMs` INTEGER NULL,
    `toolCalls` JSON NULL,
    `feedback` VARCHAR(8) NULL,
    `feedbackNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AssistantMessage_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssistantKnowledgeNote` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `noteId` VARCHAR(120) NOT NULL,
    `body` TEXT NULL,
    `updatedBy` VARCHAR(191) NULL,
    `approvedHash` VARCHAR(64) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssistantKnowledgeNote_storeId_idx`(`storeId`),
    UNIQUE INDEX `AssistantKnowledgeNote_storeId_noteId_key`(`storeId`, `noteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- VERIFICACIÓN POSTERIOR (debe devolver 3):
--   SELECT COUNT(*) FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME IN ('AssistantConversation', 'AssistantMessage', 'AssistantKnowledgeNote');
