-- Abonos libres (2026-10-29, feat/abonos-libres). Aditiva: un valor nuevo al FINAL del ENUM de OrderPayment.kind
-- (ALTER instantáneo en MySQL 8.4, sin copiar la tabla). Sin datos: ningún cobro existente cambia; el pedido …393
-- conserva su anticipo de $60.000 como DEPOSIT.
--   * OrderPayment.kind + INSTALLMENT («Abono»): cada pago que la clienta hace entre el anticipo y el saldo. Lo
--     anota el panel («Registrar abono»); en el Lote 2 lo anotará la pasarela con una referencia propia por cobro.
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre `railway`.* y ve el valor nuevo sin otra línea; `copilot_ro` no lee
-- OrderPayment.
--
-- Orden: se aplica ANTES del push (el panel nuevo escribe INSTALLMENT; el código vivo nunca lo escribe ni lo lee).
-- Lo corre Christian:
--   npm run prod:approve -- "Abonos libres (20261108_add_order_payment_installment)"
--   npm run prod:migrate -- prisma/manual-migrations/20261108_add_order_payment_installment.sql --expect new

ALTER TABLE `OrderPayment`
    MODIFY `kind` ENUM('DEPOSIT', 'BALANCE', 'INSTALLMENT') NOT NULL;

-- VERIFICACIÓN (solo lectura, como pdepapel_ro):
-- SELECT COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'railway'
--   AND TABLE_NAME = 'OrderPayment' AND COLUMN_NAME = 'kind';  -- enum('DEPOSIT','BALANCE','INSTALLMENT'), NO
-- SELECT kind, COUNT(*) FROM `OrderPayment` GROUP BY kind;  -- igual que antes; INSTALLMENT 0
