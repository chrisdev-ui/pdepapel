-- Tipo de movimiento «Conversión a variantes» (2026-09-18). Al convertir un
-- producto suelto en un grupo, el stock se reparte entre la opción que se
-- conserva y las opciones nuevas. Hasta hoy ese reparto se registraba como
-- MANUAL_ADJUSTMENT con una nota, y en el kardex se confundía con un ajuste
-- a mano. Ahora tiene su propio tipo: la salida en el producto original y la
-- entrada en cada variante nueva quedan enlazadas por `referenceId` (el id
-- del grupo).
--
-- Aditivo: solo agrega un valor al ENUM; ningún dato existente cambia.
-- Aplicar en Railway ANTES de desplegar el código que lo escribe: si el
-- código llega primero, convertir un producto en variantes falla al escribir
-- el movimiento y la transacción se revierte entera (no queda nada a medias).

ALTER TABLE `InventoryMovement`
  MODIFY COLUMN `type` ENUM(
    'ORDER_PLACED',
    'ORDER_CANCELLED',
    'MANUAL_ADJUSTMENT',
    'INITIAL_MIGRATION',
    'RETURN',
    'DAMAGE',
    'LOST',
    'PROMOTION',
    'PURCHASE',
    'INITIAL_INTAKE',
    'RESTOCK_RECEIVED',
    'STORE_USE',
    'FESTIVAL_ALLOCATION',
    'FESTIVAL_RETURN',
    'IN_PERSON_SALE',
    'VARIANT_CONVERSION'
  ) NOT NULL;

-- Verificación:
-- SHOW COLUMNS FROM InventoryMovement LIKE 'type';
