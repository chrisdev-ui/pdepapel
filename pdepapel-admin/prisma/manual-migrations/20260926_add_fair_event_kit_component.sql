-- Kits reservados como kit en las ferias (2026-09-26).
--
-- Motivo: Paula lleva a la feria kits armados («Kit de arte básico») y hasta
-- ahora el panel no dejaba reservarlos: un kit no tiene stock propio (lo
-- calcula de sus piezas) y la reserva descontaba `Product.stock` del producto
-- reservado. Ahora un kit se reserva como una sola línea de la feria y el
-- panel aparta del stock en línea las piezas que lleva, con movimientos
-- `FESTIVAL_ALLOCATION` sobre cada componente, nunca sobre el kit.
--
-- Esta tabla es la foto de la receta del kit en el momento de reservar: por
-- cada línea de feria que es un kit, qué componente y cuántas unidades por
-- kit. La venta, la anulación y el cierre (`FESTIVAL_RETURN` por componente)
-- leen esta foto y no `ProductKit`, así que editar la receta a mitad de feria
-- no cambia lo que la feria devuelve.
--
-- PURAMENTE ADITIVA: una tabla nueva. No toca ninguna existente. Sin filas,
-- todo sigue igual que antes: un producto suelto no tiene filas aquí.
--
-- Aplicar en Railway ANTES de desplegar el código que la lee: la ficha de la
-- feria incluye `kitComponents` en cada línea y fallaría sin la tabla.

CREATE TABLE IF NOT EXISTS `FairEventKitComponent` (
  `id`                       VARCHAR(191) NOT NULL,
  `fairEventInventoryItemId` VARCHAR(191) NOT NULL,
  `componentId`              VARCHAR(191) NOT NULL,
  `quantityPerKit`           INT NOT NULL,
  `createdAt`                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `FairEventKitComponent_fairEventInventoryItemId_componentId_key` (`fairEventInventoryItemId`, `componentId`),
  INDEX `FairEventKitComponent_componentId_idx` (`componentId`)
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
