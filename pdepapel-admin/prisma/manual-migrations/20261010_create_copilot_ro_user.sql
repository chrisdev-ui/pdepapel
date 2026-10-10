-- Usuario de solo lectura del copiloto (docs/design/asistente-experto-paula.md,
-- ADR 0001). NO se aplica con `prod:migrate`: lo crea Christian en la consola
-- de MySQL de Railway, con una contraseña que genera él y que nunca pasa por
-- el chat, el repositorio ni la terminal de Claude.
--
-- Pasos:
--   1. Reemplazar <REEMPLAZAR_CONTRASEÑA> por la contraseña nueva.
--   2. Ejecutar todo el archivo en la base de producción (esquema `railway`).
--   3. En Vercel › pdepapel-admin › Environment Variables, agregar
--      COPILOT_DATABASE_URL (solo Production, Sensitive) con
--      mysql://copilot_ro:<contraseña>@<host>:<puerto>/railway?connection_limit=1&pool_timeout=5
--   4. Deploy nuevo por git (cambiar la línea de pdepapel-admin/deploy-stamp.txt);
--      un redeploy no toma la variable nueva.
--
-- Qué puede leer: solo las columnas que usan las 11 herramientas. Nada de
-- nombres, teléfonos, correos, direcciones ni documentos de clientas; nada de
-- tokens, notas internas, guías ni conversaciones. Dos conexiones como mucho,
-- para que el copiloto nunca le quite conexiones al panel.
-- La prueba tests/integration/copilot-ro-grants.test.ts crea este mismo usuario
-- en la base local y corre las herramientas con él.

CREATE USER 'copilot_ro'@'%' IDENTIFIED BY '<REEMPLAZAR_CONTRASEÑA>' WITH MAX_USER_CONNECTIONS 2;

-- Tablas sin datos personales: completas.
GRANT SELECT ON `railway`.`Product` TO 'copilot_ro'@'%';
GRANT SELECT ON `railway`.`Category` TO 'copilot_ro'@'%';
GRANT SELECT ON `railway`.`OrderItem` TO 'copilot_ro'@'%';

-- Pedidos: montos, estado y fechas; nunca los datos de la clienta.
GRANT SELECT (`id`, `storeId`, `status`, `type`, `total`, `subtotal`, `netProfit`, `totalProductCost`, `paidAt`, `createdAt`)
  ON `railway`.`Order` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `orderId`, `method`) ON `railway`.`PaymentDetails` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `orderId`, `cost`) ON `railway`.`Shipping` TO 'copilot_ro'@'%';

-- Tienda y proveedores: lo justo.
GRANT SELECT (`id`, `lowStockThreshold`) ON `railway`.`Store` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `name`) ON `railway`.`Supplier` TO 'copilot_ro'@'%';

-- Inventario: el movimiento, sin el texto libre de quien lo hizo.
GRANT SELECT (`id`, `storeId`, `productId`, `type`, `quantity`, `previousStock`, `newStock`, `createdAt`)
  ON `railway`.`InventoryMovement` TO 'copilot_ro'@'%';

-- Compras con factura: total y fecha, sin el proveedor.
GRANT SELECT (`id`, `storeId`, `totalAmount`, `issuedAt`) ON `railway`.`TaxPurchase` TO 'copilot_ro'@'%';

-- Mercado Libre: sin tokens, sin comprador, sin errores crudos.
GRANT SELECT (`id`, `storeId`, `provider`, `status`, `lastSyncedAt`) ON `railway`.`MarketplaceConnection` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `connectionId`, `status`) ON `railway`.`MarketplaceListing` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `connectionId`, `kind`, `resolvedAt`, `dismissedAt`) ON `railway`.`MarketplaceAlertState` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `connectionId`, `status`, `netAmount`, `paidAt`, `createdAt`) ON `railway`.`MarketplaceOrder` TO 'copilot_ro'@'%';
GRANT SELECT (`id`, `marketplaceOrderId`, `productId`, `quantity`, `unitPrice`, `acqPrice`)
  ON `railway`.`MarketplaceOrderItem` TO 'copilot_ro'@'%';

-- VERIFICACIÓN (debe listar solo las líneas de arriba):
--   SHOW GRANTS FOR 'copilot_ro'@'%';
-- VUELTA ATRÁS: quitar COPILOT_DATABASE_URL de Vercel (el copiloto se oculta) y
--   DROP USER 'copilot_ro'@'%';
