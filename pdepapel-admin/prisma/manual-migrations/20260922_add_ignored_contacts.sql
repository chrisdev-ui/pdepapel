-- Lista de contactos que el panel ignora (2026-09-22).
--
-- Motivo: cuota, no ruido. Cada evento de WhatsApp —el entrante y el eco de
-- lo que Paula contesta desde su celular— cuesta una publicación en QStash, y
-- el tope del plan es de 1000 al día. El 21 de septiembre de 2026 hubo 1104
-- eventos; 394 de un solo contacto (+8618858869228). La cuota se agotó y los
-- mensajes de clientas reales dejaron de procesarse en silencio durante horas.
-- Sin ese contacto el día habría cerrado en 710, por debajo del tope.
--
-- Estando en esta tabla, el webhook sigue guardando el evento crudo pero no lo
-- encola: no gasta cuota, no se expande a conversación y el bot no se entera.
-- Nada se pierde y sacar a alguien de la lista es reversible.
--
-- PURAMENTE ADITIVA: una tabla nueva. No toca ninguna existente.
--
-- Las dos únicas son parciales de hecho: MySQL permite repetir NULL en un
-- índice único, así que una fila con solo teléfono y otra con solo BSUID
-- conviven sin chocar, que es justo lo que hace falta —hay contactos con las
-- dos identidades, y contactos con una sola.

CREATE TABLE IF NOT EXISTS `IgnoredContact` (
  `id`              VARCHAR(191) NOT NULL,
  `storeId`         VARCHAR(191) NOT NULL,
  `phone`           VARCHAR(191) NULL,
  `bsuid`           VARCHAR(191) NULL,
  `reason`          TEXT NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `skippedCount`    INT NOT NULL DEFAULT 0,
  `lastSkippedAt`   DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `IgnoredContact_storeId_phone_key` (`storeId`, `phone`),
  UNIQUE INDEX `IgnoredContact_storeId_bsuid_key` (`storeId`, `bsuid`),
  INDEX `IgnoredContact_storeId_idx` (`storeId`)
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
