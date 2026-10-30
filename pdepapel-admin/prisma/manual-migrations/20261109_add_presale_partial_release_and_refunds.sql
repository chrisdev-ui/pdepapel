-- Preventas, push B (2026-10-30). Aditiva: tres valores al FINAL del ENUM de OrderPayment.kind y una columna
-- nueva que admite NULL. Sin datos: ningún cobro ni línea existente cambia.
--   * OrderPayment.kind + REFUND («Devuelto»), RETAINED («Retenido»), STORE_CREDIT («Saldo a favor»): qué pasó con
--     el anticipo y los abonos al cancelar un pedido con anticipo. Cada uno es una fila del libro de pagos.
--   * OrderItem.preorderUnfulfilledAt («Sin unidad»): la preventa se liberó a medias («Liberar N») y esta línea no
--     alcanzó. Sigue sin liberar, así que el pedido no sale; Paula la devuelve y cancela.
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre `railway`.* y ve lo nuevo sin otra línea; `copilot_ro` no lee
-- OrderPayment ni OrderItem.
--
-- Orden: se aplica ANTES del push (el panel nuevo escribe los valores y la columna; el código vivo nunca los lee).
-- Lo corre Christian:
--   npm run prod:approve -- "Preventas push B (20261109_add_presale_partial_release_and_refunds)"
--   npm run prod:migrate -- prisma/manual-migrations/20261109_add_presale_partial_release_and_refunds.sql --expect new

ALTER TABLE `OrderPayment`
    MODIFY `kind` ENUM('DEPOSIT', 'BALANCE', 'INSTALLMENT', 'REFUND', 'RETAINED', 'STORE_CREDIT') NOT NULL;

ALTER TABLE `OrderItem`
    ADD COLUMN `preorderUnfulfilledAt` DATETIME(3) NULL;

-- VERIFICACIÓN (solo lectura, como pdepapel_ro):
-- SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway' AND TABLE_NAME = 'OrderPayment'
--   AND COLUMN_NAME = 'kind';  -- enum('DEPOSIT','BALANCE','INSTALLMENT','REFUND','RETAINED','STORE_CREDIT')
-- SELECT COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway'
--   AND TABLE_NAME = 'OrderItem' AND COLUMN_NAME = 'preorderUnfulfilledAt';  -- datetime(3), YES
-- SELECT kind, COUNT(*) FROM `OrderPayment` GROUP BY kind;  -- igual que antes
-- SELECT COUNT(*) FROM `OrderItem` WHERE `preorderUnfulfilledAt` IS NOT NULL;  -- 0
