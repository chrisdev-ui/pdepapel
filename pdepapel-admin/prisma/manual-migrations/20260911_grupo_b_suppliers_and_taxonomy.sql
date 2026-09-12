-- Auditoría Grupo B (2026-09-11): proveedores y atributos.
--
-- 1. Supplier gana datos de contacto (nit, contactName, phone, email,
--    leadTimeDays, notes) y el nombre pasa a ser único por tienda.
-- 2. Type gana `iconSvg` (icono propio generado con IA, estilo Lucide) y los
--    14 nombres dejan de llevar el emoji: el icono queda en `icon` como
--    nombre de Lucide (el mismo que la tienda ya elegía por palabra clave, así
--    el menú no cambia de aspecto).
-- 3. Color y Design: nombre único por tienda.
-- 4. RestockOrderReceipt: cada recepción de mercancía queda registrada con una
--    clave de idempotencia por pedido (un reintento del diálogo no duplica stock).
--
-- Producción tiene duplicados exactos que impedirían los índices; se fusionan
-- antes conservando la fila más usada y moviendo sus productos y pedidos:
--   Color   «Rojo»            conserva 4a00c774 (38 productos)  ← 11fc38dc (9)
--   Design  «Degrade»         conserva a7749565 (3 productos)   ← 207e1111 (2)
--   Design  «Osito»           conserva b08dcf0c (22 productos)  ← b78a1391 (2)
--   Supplier «Imperio papelero» conserva 292f87e1 (266 productos, 11 pedidos) ← 63f7951f (27, 2)
--
-- Verificación previa (cada consulta debe devolver exactamente los duplicados de arriba):
--   SELECT storeId, name, COUNT(*) FROM Color    GROUP BY storeId, name HAVING COUNT(*) > 1;
--   SELECT storeId, name, COUNT(*) FROM Design   GROUP BY storeId, name HAVING COUNT(*) > 1;
--   SELECT storeId, name, COUNT(*) FROM Supplier GROUP BY storeId, name HAVING COUNT(*) > 1;
--
-- Reversión: no hay reversión automática de las fusiones (los ids absorbidos
-- desaparecen); las columnas y los índices sí se pueden quitar con los DROP del final.

-- ---------------------------------------------------------------------------
-- 1. Proveedores
-- ---------------------------------------------------------------------------
UPDATE `Product`      SET `supplierId` = '292f87e1-0a62-4a66-848b-981494242a76' WHERE `supplierId` = '63f7951f-33a7-4317-9dde-902c9d68dd73';
UPDATE `RestockOrder` SET `supplierId` = '292f87e1-0a62-4a66-848b-981494242a76' WHERE `supplierId` = '63f7951f-33a7-4317-9dde-902c9d68dd73';
DELETE FROM `Supplier` WHERE `id` = '63f7951f-33a7-4317-9dde-902c9d68dd73';

ALTER TABLE `Supplier`
  ADD COLUMN `nit`          VARCHAR(32)  NULL AFTER `name`,
  ADD COLUMN `contactName`  VARCHAR(120) NULL AFTER `nit`,
  ADD COLUMN `phone`        VARCHAR(32)  NULL AFTER `contactName`,
  ADD COLUMN `email`        VARCHAR(160) NULL AFTER `phone`,
  ADD COLUMN `leadTimeDays` INT          NULL AFTER `email`,
  ADD COLUMN `notes`        TEXT         NULL AFTER `leadTimeDays`,
  ADD UNIQUE INDEX `Supplier_storeId_name_key` (`storeId`, `name`);

-- ---------------------------------------------------------------------------
-- 2. Categorías (Type): icono aparte del nombre
-- ---------------------------------------------------------------------------
ALTER TABLE `Type` ADD COLUMN `iconSvg` TEXT NULL AFTER `icon`;

UPDATE `Type` SET `name` = 'Lápices & Colores',            `icon` = 'pencil'        WHERE `id` = 'e1beaaf5-6d09-4cc9-aa30-ec227bd1bcba';
UPDATE `Type` SET `name` = 'Accesorios',                   `icon` = 'sparkles'      WHERE `id` = '9328cb33-6f95-4163-9325-74e5ef8e1dc8';
UPDATE `Type` SET `name` = 'Belleza / Cuidado Personal',   `icon` = 'flower'        WHERE `id` = 'f2dd7006-794a-4375-a519-451a61489596';
UPDATE `Type` SET `name` = 'Bolsos & Morrales',            `icon` = 'backpack'      WHERE `id` = 'cc622e4d-4700-4f98-b5e9-0c53fb5884ea';
UPDATE `Type` SET `name` = 'Carpetas',                     `icon` = 'folder'        WHERE `id` = 'd47ff844-bef0-46ee-be7f-27c837c121a4';
UPDATE `Type` SET `name` = 'Creatividad & Juego',          `icon` = 'palette'       WHERE `id` = 'e5b6c3ff-21d9-4788-a2d1-7dbf45337635';
UPDATE `Type` SET `name` = 'Cuadernos',                    `icon` = 'notebook-pen'  WHERE `id` = '6ea3da6c-b951-4f62-9bb7-023b4843cbdd';
UPDATE `Type` SET `name` = 'Escritura',                    `icon` = 'pen-line'      WHERE `id` = '4b977770-a2a3-4c05-8f1d-5fe41f30e48e';
UPDATE `Type` SET `name` = 'Journal / Scrap',              `icon` = 'sticker'       WHERE `id` = '1ca0ec40-bd20-4ef9-bedc-c8b61fa888b4';
UPDATE `Type` SET `name` = 'Kits',                         `icon` = 'gift'          WHERE `id` = 'c654b112-572f-4c98-b6c0-2e233a7a04a6';
UPDATE `Type` SET `name` = 'Lectura',                      `icon` = 'book-open'     WHERE `id` = 'd208f62f-fdeb-4eeb-b722-5752cce778e2';
UPDATE `Type` SET `name` = 'Oficina',                      `icon` = 'briefcase'     WHERE `id` = 'a4fc6064-aea0-4240-9f11-c7b793d4f068';
UPDATE `Type` SET `name` = 'Planeación & Organización',    `icon` = 'calendar-days' WHERE `id` = '65b3fc29-a778-448a-a61f-037c9d9a90ca';
UPDATE `Type` SET `name` = 'Útiles',                       `icon` = 'paperclip'     WHERE `id` = '016cabf2-4a5b-421b-b6a0-c163ac3c3537';

-- ---------------------------------------------------------------------------
-- 3. Colores y diseños: nombre único por tienda
-- ---------------------------------------------------------------------------
UPDATE `Product` SET `colorId`  = '4a00c774-e018-4843-af1d-3faffcabaf46' WHERE `colorId`  = '11fc38dc-a624-483c-9be4-76a7dbc53083';
DELETE FROM `Color` WHERE `id` = '11fc38dc-a624-483c-9be4-76a7dbc53083';

UPDATE `Product` SET `designId` = 'a7749565-e484-4ff0-afce-65c0e74e7f96' WHERE `designId` = '207e1111-a1ac-4bf6-9b8b-b3fd48925b42';
DELETE FROM `Design` WHERE `id` = '207e1111-a1ac-4bf6-9b8b-b3fd48925b42';
UPDATE `Product` SET `designId` = 'b08dcf0c-c821-45ce-aaef-e11b4eb4d2e4' WHERE `designId` = 'b78a1391-cfd4-467b-be50-de35ff6035b1';
DELETE FROM `Design` WHERE `id` = 'b78a1391-cfd4-467b-be50-de35ff6035b1';

ALTER TABLE `Color`  ADD UNIQUE INDEX `Color_storeId_name_key`  (`storeId`, `name`);
ALTER TABLE `Design` ADD UNIQUE INDEX `Design_storeId_name_key` (`storeId`, `name`);

-- ---------------------------------------------------------------------------
-- 4. Recepciones de aprovisionamiento
-- ---------------------------------------------------------------------------
CREATE TABLE `RestockOrderReceipt` (
  `id`             VARCHAR(191) NOT NULL,
  `storeId`        VARCHAR(191) NOT NULL,
  `restockOrderId` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(64)  NOT NULL,
  `receivedUnits`  INT          NOT NULL,
  `lineCount`      INT          NOT NULL,
  `excessUnits`    INT          NOT NULL DEFAULT 0,
  `updatedCosts`   BOOLEAN      NOT NULL DEFAULT false,
  `lines`          JSON         NOT NULL,
  `createdBy`      VARCHAR(191) NULL,
  `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RestockOrderReceipt_restockOrderId_idempotencyKey_key` (`restockOrderId`, `idempotencyKey`),
  INDEX `RestockOrderReceipt_storeId_idx` (`storeId`),
  INDEX `RestockOrderReceipt_restockOrderId_idx` (`restockOrderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Reversión parcial (estructura):
-- DROP TABLE `RestockOrderReceipt`;
-- ALTER TABLE `Design` DROP INDEX `Design_storeId_name_key`;
-- ALTER TABLE `Color`  DROP INDEX `Color_storeId_name_key`;
-- ALTER TABLE `Type`   DROP COLUMN `iconSvg`;
-- ALTER TABLE `Supplier` DROP INDEX `Supplier_storeId_name_key`, DROP COLUMN `nit`, DROP COLUMN `contactName`, DROP COLUMN `phone`, DROP COLUMN `email`, DROP COLUMN `leadTimeDays`, DROP COLUMN `notes`;
