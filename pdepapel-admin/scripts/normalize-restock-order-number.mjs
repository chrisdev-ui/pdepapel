/**
 * Rellena con ceros el único número de pedido de aprovisionamiento que quedó
 * sin formato: `PO-5` → `PO-0005`.
 *
 * Por qué a mano y no en el código: el rework ya muestra el número relleno en
 * pantalla (`displayRestockOrderNumber`), pero la fila guardada sigue diciendo
 * `PO-5`, y eso se ve en exportaciones, en el CSV de la tabla y en cualquier
 * consulta directa. Es una fila, una columna, y no toca dinero ni inventario.
 *
 * Se ejecuta por la puerta de siempre:
 *
 *   npm run prod:approve -- "normalizar PO-5 a PO-0005"
 *   npm run prod:write -- scripts/normalize-restock-order-number.mjs
 *
 * Es idempotente: el `updateMany` lleva el valor viejo en el `where`, así que
 * una segunda pasada no encuentra nada y no cambia nada.
 */
import { createProdClient } from "./lib/prod-client.mjs";

const FROM = "PO-5";
const TO = "PO-0005";

const db = createProdClient();

try {
  const targets = await db.restockOrder.findMany({
    where: { orderNumber: FROM },
    select: { id: true, storeId: true, orderNumber: true, status: true, createdAt: true },
  });

  if (targets.length === 0) {
    console.log(`No hay ninguna fila con «${FROM}»: nada que hacer.`);
    console.log("PROD_WRITE_ROWS=0");
  } else if (targets.length > 1) {
    // Nunca debería pasar; si pasa, se para en seco en vez de tocar varias.
    throw new Error(`Se esperaba una sola fila con «${FROM}» y hay ${targets.length}. No se cambia nada.`);
  } else {
    const target = targets[0];

    // `@@unique([storeId, orderNumber])`: si el destino ya existe, el update
    // fallaría con P2002. Se comprueba antes para dar un mensaje claro.
    const collision = await db.restockOrder.findFirst({
      where: { storeId: target.storeId, orderNumber: TO },
      select: { id: true },
    });
    if (collision) {
      throw new Error(`Ya existe «${TO}» en esta tienda (${collision.id}). No se cambia nada.`);
    }

    console.log("Antes:", JSON.stringify(target));

    // El `where` lleva el id **y** el valor viejo: si alguien lo cambió entre
    // la lectura y la escritura, el update no encuentra nada.
    const result = await db.restockOrder.updateMany({
      where: { id: target.id, orderNumber: FROM },
      data: { orderNumber: TO },
    });

    const after = await db.restockOrder.findUnique({
      where: { id: target.id },
      select: { id: true, orderNumber: true },
    });

    console.log("Después:", JSON.stringify(after));
    console.log(`Filas cambiadas: ${result.count}`);
    console.log(`PROD_WRITE_ROWS=${result.count}`);
  }
} finally {
  await db.$disconnect();
}
