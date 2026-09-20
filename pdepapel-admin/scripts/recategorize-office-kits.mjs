/**
 * Saca los cuatro «Kit oficina» de la categoría «Kits sorpresa».
 *
 * Están ahí por error y eso tiene dos consecuencias visibles: la tienda les
 * pone el aviso de caja sorpresa —«no se puede escoger qué viene adentro»,
 * que es falso, porque el comprador elige el color— e Inventario deja de
 * listarlos, porque esa categoría se esconde de las existencias sueltas (las
 * cápsulas ya se contaron al empacar el lote).
 *
 * Van a «Kits de oficina», una categoría nueva bajo el tipo **Kits**, que es
 * donde el catálogo ya guarda «Kits de lectura» y «Kits de Journal / Scrap».
 * Meterlos en «Kits escolares» habría evitado crear la categoría, pero son
 * kits de oficina y el nombre importa: lo lee la clienta.
 *
 * No toca la «Cajita sorpresa Snoopy», que sí es una caja sorpresa y se queda
 * donde está.
 *
 * Es idempotente: se puede correr dos veces sin cambiar nada la segunda.
 *
 *   npm run prod:approve -- "recategorizar los 4 Kit oficina fuera de Kits sorpresa"
 *   npm run prod:write -- scripts/recategorize-office-kits.mjs
 *
 * Con `--dry-run` sólo informa, sin escribir.
 */
import { createProdClient } from "./lib/prod-client.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/** La categoría equivocada de la que hay que sacarlos. */
const CAPSULE_CATEGORY_ID = "9bdebb9f-8a23-4bed-a8a4-8e6de8b58f47";
/** El tipo «Kits», donde viven todas las categorías «Kits de …». */
const KITS_TYPE_ID = "c654b112-572f-4c98-b6c0-2e233a7a04a6";
const TARGET_NAME = "Kits de oficina";
const TARGET_SLUG = "kits-de-oficina";

/**
 * Los cuatro, por id y con el nombre que se espera encontrar. Si el nombre no
 * coincide, el guion se detiene: prefiero no escribir a escribir sobre una
 * fila que ya no es la que revisé.
 */
const OFFICE_KITS = [
  { id: "ee53a5a0-9775-4868-95c1-9c80358ea9d8", name: "Kit oficina amarillo" },
  { id: "a1346850-c88a-4e7d-8e8a-fc2b6b77b21e", name: "Kit oficina azul" },
  { id: "6bd5df96-a1e6-45cc-8c83-625355ce3c0d", name: "Kit oficina lila" },
  { id: "9f65e560-6641-4c16-a253-cd99123f7c41", name: "Kit oficina rosa" },
];

const db = createProdClient();

try {
  const products = await db.product.findMany({
    where: { id: { in: OFFICE_KITS.map((kit) => kit.id) } },
    select: {
      id: true,
      name: true,
      sku: true,
      storeId: true,
      isArchived: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  });

  if (products.length !== OFFICE_KITS.length) {
    const found = new Set(products.map((product) => product.id));
    const missing = OFFICE_KITS.filter((kit) => !found.has(kit.id));
    throw new Error(
      `No están los cuatro productos: faltan ${missing.map((kit) => `${kit.name} (${kit.id})`).join(", ")}. Nada se escribió.`,
    );
  }

  for (const product of products) {
    const expected = OFFICE_KITS.find((kit) => kit.id === product.id);
    if (product.name !== expected.name) {
      throw new Error(
        `El producto ${product.id} se llama «${product.name}» y esperaba «${expected.name}». Nada se escribió.`,
      );
    }
  }

  const storeIds = Array.from(new Set(products.map((product) => product.storeId)));
  if (storeIds.length !== 1) {
    throw new Error(`Los cuatro productos deberían ser de una sola tienda; hay ${storeIds.length}. Nada se escribió.`);
  }
  const storeId = storeIds[0];

  console.log("ANTES");
  for (const product of products) {
    console.log(`  ${product.name.padEnd(22)} · ${product.sku} · categoría: ${product.category.name} (${product.category.slug})`);
  }

  const pending = products.filter((product) => product.category.id === CAPSULE_CATEGORY_ID);
  if (pending.length === 0) {
    console.log("\nYa estaban fuera de «Kits sorpresa»: no hay nada que hacer.");
    process.exit(0);
  }

  // La categoría destino: se reutiliza si ya existe (el guion es idempotente).
  let target = await db.category.findFirst({
    where: { storeId, slug: TARGET_SLUG },
    select: { id: true, name: true, slug: true, isArchived: true },
  });

  if (target?.isArchived) {
    throw new Error(`La categoría «${TARGET_NAME}» existe pero está archivada. Desarchívala desde el panel y vuelve a correr esto.`);
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] ${target ? "usaría" : "crearía"} la categoría «${TARGET_NAME}» (${TARGET_SLUG}) bajo el tipo Kits`);
    console.log(`[dry-run] movería ${pending.length} producto(s); no se escribió nada.`);
    process.exit(0);
  }

  if (!target) {
    target = await db.category.create({
      data: { storeId, typeId: KITS_TYPE_ID, name: TARGET_NAME, slug: TARGET_SLUG },
      select: { id: true, name: true, slug: true, isArchived: true },
    });
    console.log(`\nCategoría creada: ${target.name} (${target.slug}) · ${target.id}`);
  } else {
    console.log(`\nCategoría que ya existía: ${target.name} (${target.slug}) · ${target.id}`);
  }

  const moved = await db.product.updateMany({
    where: { id: { in: pending.map((product) => product.id) }, categoryId: CAPSULE_CATEGORY_ID },
    data: { categoryId: target.id },
  });
  console.log(`Productos movidos: ${moved.count}`);

  const after = await db.product.findMany({
    where: { id: { in: OFFICE_KITS.map((kit) => kit.id) } },
    select: { id: true, name: true, sku: true, category: { select: { name: true, slug: true } } },
    orderBy: { name: "asc" },
  });
  console.log("\nDESPUÉS");
  for (const product of after) {
    console.log(`  ${product.name.padEnd(22)} · ${product.sku} · categoría: ${product.category.name} (${product.category.slug})`);
  }

  const stillWrong = after.filter((product) => product.category.slug === "kits-sorpresa");
  if (stillWrong.length > 0) {
    throw new Error(`Quedaron ${stillWrong.length} en «Kits sorpresa»; revisa antes de dar esto por hecho.`);
  }

  const remaining = await db.product.count({
    where: { categoryId: CAPSULE_CATEGORY_ID, isArchived: false },
  });
  console.log(`\nActivos que siguen en «Kits sorpresa»: ${remaining} (debería ser 1: la Cajita sorpresa Snoopy)`);
} finally {
  await db.$disconnect();
}
