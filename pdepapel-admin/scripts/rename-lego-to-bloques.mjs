/**
 * Quita «Lego» de los identificadores del catálogo: son bloques de
 * construcción compatibles, no productos de la marca LEGO. La categoría
 * «Lego» pasa a «Bloques de construcción» (slug `bloques-de-construccion`) y
 * `lego` queda como alias (308 al canónico). También 37 productos, 6 grupos y
 * el diseño «Lego»: nombre, slug y descripción. El slug viejo de cada
 * producto queda como alias. La mención «estilo Lego» solo queda en las
 * descripciones (aviso al final) y como última frase del seoIntro de la
 * categoría. No toca `seoEnabled` (va aparte, después de verificar la 308).
 *
 *   node --env-file=.env scripts/rename-lego-to-bloques.mjs [--dry-run]
 *       Solo lectura (pdepapel_ro): arma el plan, comprueba colisiones y
 *       ocurrencias, y guarda la copia (antes y después de cada campo) en
 *       ~/pdepapel-backups/<fecha>/. También escribe el plan legible al lado.
 *   npm run prod:write -- scripts/rename-lego-to-bloques.mjs --apply <copia.json>
 *   npm run prod:write -- scripts/rename-lego-to-bloques.mjs --revert <copia.json>
 *       Escritura con aprobación fresca. Rehace el plan con la base actual y
 *       exige que sea idéntico al de la copia. Una sola transacción: cada fila
 *       se actualiza con todos sus valores anteriores en el `where` y tiene que
 *       cambiar exactamente 1. Los alias se crean (o borran) en bloque y la
 *       cuenta tiene que cuadrar. Si algo falla, no se escribe nada.
 *
 * Los slugs nuevos salen del mismo algoritmo del panel (`lib/slugify.ts` y
 * `synchronizeProductGroupSlugs`), así que una edición posterior del grupo no
 * los vuelve a cambiar. El ensayo comprueba la réplica contra los slugs
 * actuales.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const DISCLAIMER = "Son bloques de construcción estilo Lego. No son productos de LEGO ni están afiliados a LEGO Group.";
const SEO_INTRO_MAX_LENGTH = 1200;
/** Corte de la meta description y del extracto JSON-LD en la tienda (lib/product-metadata.ts, lib/rich-text.ts). */
const META_DESCRIPTION_MAX_LENGTH = 160;
const LEGO = /(^|[^\p{L}\p{N}])lego/iu;

const CATEGORY = {
  id: "a8729e87-34ae-494d-944b-b3a09bab3a42",
  name: ["Lego", "Bloques de construcción"],
  slug: ["lego", "bloques-de-construccion"],
};

const DESIGN = { id: "c2a2a452-e28b-4aad-9c9b-78a3ef772d3e", name: ["Lego", "Bloques"] };

// ── Descripciones ───────────────────────────────────────────────────────────
// replace: pares exactos que tienen que aparecer una sola vez; append: cómo se
// añade el aviso al final (html → <p>, text → línea en blanco, line → salto).
// whole: el texto completo actual (sin espacios al borde) y el nuevo.
const html = (pairs) => ({ replace: pairs, append: "html" });
const text = (pairs) => ({ replace: pairs, append: "text" });
const line = (pairs) => ({ replace: pairs, append: "line" });
const whole = (from, to) => ({ whole: [from, to] });
const onlyDisclaimer = whole("", DISCLAIMER);
const shortBody = (from, intro) => whole(from, `${intro} ${DISCLAIMER}`);
/**
 * Productos vivos sin descripción: el aviso solo no sirve, porque la tienda
 * usa la descripción como meta description y el aviso quedaría dentro de los
 * 160 caracteres. Va un párrafo neutro antes y el aviso queda fuera del corte.
 */
const liveFigure = (figure) =>
  whole(
    "",
    `<p>Set de bloques de construcción para armar una figura de ${figure}. Una vez armada, queda lista para exhibir en el escritorio, en la repisa o junto a tu colección.</p><p>${DISCLAIMER}</p>`,
  );

const FLORES = html([
  ["Estos <strong>legos pequeños en forma de materas con flores</strong>", "Estos <strong>bloques de construcción pequeños en forma de materas con flores</strong>"],
  ["• Amantes de las manualidades y los legos", "• Amantes de las manualidades y los bloques de construcción"],
  ["No es solo un lego, es una experiencia", "No es solo un set de bloques, es una experiencia"],
]);
const JUEGO_DE_FICHAS = (figure) => shortBody(`Juego de fichas (tipo Lego) en forma de ${figure}.`, `Juego de fichas en forma de ${figure}.`);

const GROUPS = [
  { id: "20da8fc2-b083-45e3-972c-bc3720ff61f0", name: ["Lego Demon Slayer: Kimetsu no Yaiba", "Bloques de construcción Demon Slayer: Kimetsu no Yaiba"] },
  { id: "247110ec-80df-4f4c-8215-352495ef75fd", name: ["Lego Mundo de Mario Bros", "Bloques de construcción Mundo de Mario Bros"] },
  { id: "2b61585f-f581-4476-9e56-87c4c7aa5c66", name: ["Legos Flores", "Bloques de construcción Flores"], description: FLORES },
  { id: "44383a15-6d12-48c2-a805-aa6f7756b637", name: ["Lego Super héroes", "Bloques de construcción Super héroes"] },
  { id: "d8f5802e-035e-4ef0-bdac-fa3f0485e750", name: ["Lego Bob esponja y amigos", "Bloques de construcción Bob esponja y amigos"] },
  { id: "f580c53e-9393-4398-9c70-3c11d6749b59", name: ["Lego SANRIO", "Bloques de construcción SANRIO"] },
];

const PRODUCTS = [
  // Vivos (7)
  { id: "9741a110-4b3a-4760-9f8b-474364c7c49e", name: ["Lego Batman", "Bloques de construcción Batman"], description: liveFigure("Batman") },
  { id: "c4b4c50f-248e-43fc-9cf6-297ca1e81c6f", name: ["Lego Calamardo", "Bloques de construcción Calamardo"], description: liveFigure("Calamardo") },
  { id: "edef0873-b77c-4eed-ae28-ecb9cd199bdd", name: ["Lego Capitán América ", "Bloques de construcción Capitán América"], description: liveFigure("Capitán América") },
  { id: "0fb843f8-6db4-4362-97ab-207aac239a57", name: ["Lego Luigi", "Bloques de construcción Luigi"], description: liveFigure("Luigi") },
  {
    id: "916161ef-fff4-4eae-8f51-852dd2ae0c37",
    name: ["Lego Panda ", "Bloques de construcción Panda"],
    description: html([
      ["<strong>Legos de Panda (Diseños Surtidos)</strong>", "<strong>Bloques de construcción de Panda (Diseños Surtidos)</strong>"],
      ["Estos legos de panda vienen", "Estos bloques de panda vienen"],
      ["Bloques tipo lego para armar figura de panda", "Bloques de construcción para armar figura de panda"],
    ]),
  },
  { id: "3a651fb3-185d-4375-a2c9-9f47e8d6e5c8", name: ["Lego Psyduck", "Bloques de construcción Psyduck"], description: liveFigure("Psyduck") },
  {
    id: "eb445f2f-39a6-4811-a35c-7395a162714f",
    name: ["Lego Winnie Pooh y sus amigos", "Bloques de construcción Winnie Pooh y sus amigos"],
    description: text([
      ["con estos mini legos de Winnie Pooh y Tigger", "con estos mini bloques de construcción de Winnie Pooh y Tigger"],
      ["estos mini legos mantienen su forma", "estos mini bloques mantienen su forma"],
    ]),
  },
  // Archivados (30)
  {
    id: "2716d056-6f52-49d6-a088-2e519d9f2759",
    name: ["Kit Stitch 3", "Kit Stitch 3"],
    description: {
      replace: [["🧩 Lego de colección", "🧩 Figura de bloques de colección"]],
      append: "custom",
      disclaimer: "La figura de bloques es estilo Lego. No es un producto de LEGO ni está afiliada a LEGO Group.",
      separator: "\n",
    },
  },
  { id: "6fc184a1-cd74-4535-bac8-1e93acd44720", name: ["Lego animados", "Bloques de construcción animados"], description: whole("Lego", DISCLAIMER) },
  { id: "b14ec56c-837f-487d-b9ee-39f36f36ab40", name: ["Lego Bob Esponja", "Bloques de construcción Bob Esponja"], description: onlyDisclaimer },
  { id: "d6bf1d86-7948-4fb7-9c89-61a321accf14", name: ["Lego Cinnamoroll", "Bloques de construcción Cinnamoroll"], description: shortBody("Lego con diseño de Cinnamoroll", "Set de bloques con diseño de Cinnamoroll.") },
  { id: "1cdcc87e-31cb-4c23-b705-047b2f1dde41", name: ["Lego Don Cangrejo", "Bloques de construcción Don Cangrejo"], description: onlyDisclaimer },
  { id: "1577f8b9-2cc0-432c-b661-3a65c2f42375", name: ["Lego Flor Amarilla #7222", "Bloques de construcción Flor Amarilla #7222"], description: whole("Lego", DISCLAIMER) },
  { id: "cb7feecd-8ec1-43fc-b285-6d69f8f8155f", name: ["Lego Flor Morada #7228", "Bloques de construcción Flor Morada #7228"], description: FLORES },
  { id: "c48e2855-413e-4bca-8408-c9131836518b", name: ["Lego Flor roja #7227", "Bloques de construcción Flor roja #7227"], description: FLORES },
  { id: "38c60910-cb0e-4094-bea1-c0748681be8f", name: ["Lego Flor Rosa #7224", "Bloques de construcción Flor Rosa #7224"], description: FLORES },
  { id: "ed212ad5-973d-4132-818c-30967e0d03d1", name: ["Lego Flor verde #7229", "Bloques de construcción Flor verde #7229"], description: shortBody("Lego en forma de flor", "Set de bloques en forma de flor.") },
  { id: "b227449e-759c-445f-ad40-e67c8c42c567", name: ["Lego Flying Pets", "Bloques de construcción Flying Pets"], description: whole("Lego", DISCLAIMER) },
  { id: "23961fd8-b12d-4ce9-bd86-8d656c21dd4d", name: ["Lego Garfield", "Bloques de construcción Garfield"], description: shortBody("Juego de fichas (tipo Lego) en forma de Garfield", "Juego de fichas en forma de Garfield.") },
  {
    id: "bcd28e86-db9d-4572-a5a8-3f90705624b7",
    name: ["Lego Goofy", "Bloques de construcción Goofy"],
    description: text([
      ["Este mini Lego de Goofy es", "Este mini set de bloques de Goofy es"],
      ["este mini Lego mantiene su forma", "este mini set de bloques mantiene su forma"],
    ]),
  },
  { id: "cd30cc29-d040-432b-809c-4f2d89d8177c", name: ["Lego Hello Kitty", "Bloques de construcción Hello Kitty"], description: JUEGO_DE_FICHAS("Hello Kitty") },
  { id: "64f72570-b0c6-4c95-930d-a9099e606127", name: ["Lego Kuromi", "Bloques de construcción Kuromi"], description: JUEGO_DE_FICHAS("Kuromi") },
  { id: "b902b628-2d4a-4af2-8543-6e5a7db3f989", name: ["Lego Kuromi ", "Bloques de construcción Kuromi"], description: onlyDisclaimer },
  { id: "b6b4783e-2d01-4161-8997-7c41887e1be8", name: ["Lego Mario Bros", "Bloques de construcción Mario Bros"], description: onlyDisclaimer },
  { id: "e3e89bdd-0071-443d-967f-2d2a585f56f9", name: ["Lego My Melody", "Bloques de construcción My Melody"], description: shortBody("Lego con diseño de My Melody", "Set de bloques con diseño de My Melody.") },
  { id: "fdadb4d4-71f6-4c2c-9116-a275ca15b247", name: ["Lego My Melody ", "Bloques de construcción My Melody"], description: onlyDisclaimer },
  {
    id: "fcf9615b-b26c-4ea8-b058-c1aa4c0c428d",
    name: ["Lego Navidad", "Bloques de construcción Navidad"],
    description: line([["Estos mini sets tipo LEGO incluyen", "Estos mini sets de bloques de construcción incluyen"]]),
  },
  { id: "4239873a-060e-4387-b0d6-9a5a3b6e30a5", name: ["Lego Nezuko", "Bloques de construcción Nezuko"], description: onlyDisclaimer },
  {
    id: "b50b4a29-60b9-44b3-9063-e8d5fc29ec39",
    name: ["Lego Patrol ", "Bloques de construcción Patrol"],
    description: text([
      ["Estos mini legos de los perritos de Paw Patrol", "Estos mini bloques de construcción de los perritos de Paw Patrol"],
      ["estos mini legos mantienen su forma", "estos mini bloques mantienen su forma"],
    ]),
  },
  { id: "2012dd10-eaec-4908-8c12-fb6d3a935963", name: ["Lego Pochacco", "Bloques de construcción Pochacco"], description: JUEGO_DE_FICHAS("Pochacco") },
  { id: "804382d9-c4eb-49e5-b210-f17c1e4e38f7", name: ["Lego Pochacco ", "Bloques de construcción Pochacco"], description: onlyDisclaimer },
  { id: "095a1d81-e7ee-4472-bac3-aaf50048bef7", name: ["Lego Sailor moon", "Bloques de construcción Sailor moon"], description: onlyDisclaimer },
  { id: "ebac0427-4276-4780-8fcb-a187ae42e556", name: ["Lego Stitch", "Bloques de construcción Stitch"], description: JUEGO_DE_FICHAS("Stitch") },
  { id: "d661d801-a982-46ef-9e04-c13ba7beb8e2", name: ["Lego Tanjiro Kamado", "Bloques de construcción Tanjiro Kamado"], description: onlyDisclaimer },
  { id: "95309241-4a32-495a-983e-d7e3895f2456", name: ["Lego Toy Story - Marciano", "Bloques de construcción Toy Story - Marciano"], description: onlyDisclaimer },
  { id: "b2b497e5-6669-4c8f-bf00-01c889aad8d5", name: ["Lego Zootopia - NIck Wilde", "Bloques de construcción Zootopia - NIck Wilde"], description: shortBody("Lego Zootopia", "Set de bloques de Zootopia.") },
  {
    id: "8391d4e0-30df-4585-b50b-b0cd3c89818f",
    name: ["Tajalápiz lego", "Tajalápiz de bloques"],
    description: whole(
      "Tajalápiz Lego en forma de animalitos: Tucán y Jirafa.",
      "Tajalápiz de bloques en forma de animalitos: Tucán y Jirafa. Es un tajalápiz estilo Lego. No es un producto de LEGO ni está afiliado a LEGO Group.",
    ),
  },
];

// ── Réplica de lib/slugify.ts y lib/product-slugs.ts ────────────────────────
function slugify(value) {
  if (!value) return "";
  return value
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
const LOGISTICS_SIZE_VALUE_PATTERN = /^(?:XXS|XS|S|M|L|XL|XXL)-(?:L|P)$/i;
const INTERNAL_SIZE_CODE_PATTERN = /^(?:XXS|XS|S|M|L|XL|XXL)\+$/i;
function isCustomerFacingSize(size) {
  const sizeName = size?.name?.trim();
  const sizeValue = size?.value?.trim();
  if (!sizeName) return false;
  return !(LOGISTICS_SIZE_VALUE_PATTERN.test(sizeName) || LOGISTICS_SIZE_VALUE_PATTERN.test(sizeValue || "") || INTERNAL_SIZE_CODE_PATTERN.test(sizeName));
}
function generateProductSlug(product) {
  const base = slugify(product.name);
  if (!product.includeVariantAttributes) return base;
  const attributes = [];
  const { design, color, size, variantAttributes } = product;
  if (variantAttributes?.design !== false && design?.name && !["S-D", "Sin Diseño", "Estándar"].includes(design.name)) attributes.push(design.name);
  if (variantAttributes?.color !== false && color?.name && !["S-C", "Sin Color"].includes(color.name)) attributes.push(color.name);
  if (variantAttributes?.size !== false && size?.name && !["Sin Tamaño", "Estándar", "Única"].includes(size.name) && isCustomerFacingSize(size)) attributes.push(size.name);
  if (attributes.length > 0) {
    const baseTokens = new Set(base.split("-").filter(Boolean));
    const missing = slugify(attributes.join(" ")).split("-").filter((token) => token && !baseTokens.has(token));
    if (missing.length > 0) return `${base}-${missing.join("-")}`;
  }
  return base;
}
function getVariantSlugAttributeInclusion(products) {
  const multiple = (get) => products.length > 1 && new Set(products.map((p) => get(p) || "")).size > 1;
  return { color: multiple((p) => p.color?.name), design: multiple((p) => p.design?.name), size: multiple((p) => p.size?.value || p.size?.name) };
}
function buildUniqueSlug(baseSlug, reserved) {
  let slug = baseSlug || "producto";
  let suffix = 2;
  while (reserved.has(slug)) slug = `${baseSlug || "producto"}-${suffix++}`;
  return slug;
}

// ── Texto plano y campos derivados (réplica de la tienda y de los feeds) ────
const BLOCK_TAG = /<\/?(?:p|br|div|li|ul|ol|h[1-6]|blockquote|tr|td|th|table|section|article)\b[^>]*>/gi;
const plain = (value) =>
  (value || "")
    .replace(BLOCK_TAG, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|quot|#39);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
function truncate(value, max) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > 0 ? boundary : max - 1).trimEnd()}…`;
}
const fold = (value) => value.toLocaleLowerCase("es-CO").normalize("NFD").replace(/[̀-ͯ]/g, "");

function applyDescription(current, spec, where) {
  if (spec.whole) {
    const [from, to] = spec.whole;
    if (current.trim() !== from) throw new Error(`${where}: la descripción actual no es la esperada (${JSON.stringify(current.slice(0, 80))})`);
    return to;
  }
  let next = current;
  for (const [from, to] of spec.replace) {
    const count = next.split(from).length - 1;
    if (count !== 1) throw new Error(`${where}: «${from}» aparece ${count} veces, se esperaba 1`);
    next = next.replace(from, to);
  }
  if (spec.append === "html") return `${next.trimEnd()}<p>${DISCLAIMER}</p>`;
  if (spec.append === "text") return `${next.trimEnd()}\n\n${DISCLAIMER}`;
  if (spec.append === "line") return `${next.trimEnd()}\n${DISCLAIMER}`;
  if (spec.append === "custom") return `${next.trimEnd()}${spec.separator}${spec.disclaimer}`;
  throw new Error(`${where}: modo de aviso desconocido`);
}

// ── Lectura y plan ──────────────────────────────────────────────────────────
async function readSnapshot(db) {
  const productIds = PRODUCTS.map((p) => p.id);
  const groupIds = GROUPS.map((g) => g.id);
  const [category, design, groups, products, groupMembers, productSlugs, aliases, deletedUrls, categoryClash, categoryAliases, designClash, otherGroupSlugs] = await Promise.all([
    db.category.findFirst({ where: { id: CATEGORY.id, storeId: STORE_ID }, select: { id: true, name: true, slug: true, seoIntro: true, seoTitle: true, seoDescription: true, type: { select: { name: true } } } }),
    db.design.findFirst({ where: { id: DESIGN.id, storeId: STORE_ID }, select: { id: true, name: true } }),
    db.productGroup.findMany({ where: { id: { in: groupIds }, storeId: STORE_ID }, select: { id: true, name: true, slug: true, description: true, brand: true } }),
    db.product.findMany({
      where: { id: { in: productIds }, storeId: STORE_ID },
      select: {
        id: true, name: true, slug: true, description: true, isArchived: true, brand: true, gtin: true, mpn: true, productGroupId: true, categoryId: true,
        color: { select: { name: true, value: true } }, design: { select: { name: true } }, size: { select: { name: true, value: true } },
      },
    }),
    db.product.findMany({ where: { storeId: STORE_ID, productGroupId: { in: groupIds } }, select: { id: true, productGroupId: true } }),
    db.product.findMany({ where: { storeId: STORE_ID }, select: { id: true, slug: true } }),
    db.productSlugAlias.findMany({ where: { storeId: STORE_ID }, select: { productId: true, slug: true } }),
    db.deletedProductUrl.findMany({ where: { storeId: STORE_ID }, select: { slug: true } }),
    db.category.findMany({ where: { storeId: STORE_ID, slug: { in: [CATEGORY.slug[1], CATEGORY.slug[0]] } }, select: { id: true, slug: true } }),
    db.categorySlugAlias.findMany({ where: { storeId: STORE_ID, slug: { in: [CATEGORY.slug[1], CATEGORY.slug[0]] } }, select: { categoryId: true, slug: true } }),
    db.design.findMany({ where: { storeId: STORE_ID, name: DESIGN.name[1] }, select: { id: true } }),
    db.productGroup.findMany({ where: { storeId: STORE_ID, NOT: { id: { in: groupIds } } }, select: { slug: true } }),
  ]);
  return { category, design, groups, products, groupMembers, productSlugs, aliases, deletedUrls, categoryClash, categoryAliases, designClash, otherGroupSlugs };
}

function buildPlan(snap) {
  const problems = [];
  const fail = (message) => problems.push(message);

  // Categoría
  const c = snap.category;
  if (!c) throw new Error("no existe la categoría");
  if (c.name !== CATEGORY.name[0] || c.slug !== CATEGORY.slug[0]) fail(`categoría: nombre/slug actuales ${JSON.stringify([c.name, c.slug])}`);
  if (!c.seoIntro || LEGO.test(c.seoIntro)) fail("categoría: seoIntro vacío o ya menciona Lego");
  const seoIntroNext = `${(c.seoIntro || "").trimEnd()} ${DISCLAIMER}`;
  if (seoIntroNext.length > SEO_INTRO_MAX_LENGTH) fail(`categoría: seoIntro quedaría con ${seoIntroNext.length} caracteres`);
  if (snap.categoryClash.some((row) => row.id !== CATEGORY.id)) fail(`categoría: otro registro usa ${CATEGORY.slug.join(" o ")}`);
  if (snap.categoryAliases.length) fail(`categoría: ya hay alias ${JSON.stringify(snap.categoryAliases)}`);
  const category = {
    id: c.id,
    before: { name: c.name, slug: c.slug },
    after: { name: CATEGORY.name[1], slug: CATEGORY.slug[1] },
    seoIntro: { before: c.seoIntro, after: seoIntroNext },
  };
  const categoryAliases = [{ categoryId: c.id, slug: CATEGORY.slug[0] }];

  // Diseño
  const d = snap.design;
  if (!d || d.name !== DESIGN.name[0]) fail(`diseño: actual ${JSON.stringify(d?.name)}`);
  if (snap.designClash.length) fail(`diseño: ya existe uno llamado ${DESIGN.name[1]}`);
  const design = { id: DESIGN.id, before: { name: d?.name }, after: { name: DESIGN.name[1] } };

  // Grupos
  const groupById = new Map(snap.groups.map((g) => [g.id, g]));
  const otherGroupSlugs = new Set(snap.otherGroupSlugs.map((g) => g.slug));
  const groups = GROUPS.map((spec) => {
    const g = groupById.get(spec.id);
    if (!g) throw new Error(`grupo ${spec.id} no existe`);
    if (g.name !== spec.name[0]) fail(`grupo ${spec.id}: nombre actual ${JSON.stringify(g.name)}`);
    const slug = slugify(spec.name[1]);
    if (otherGroupSlugs.has(slug)) fail(`grupo ${spec.id}: el slug ${slug} ya lo usa otro grupo`);
    const description = spec.description ? applyDescription(g.description, spec.description, `grupo ${g.name}`) : g.description;
    return { id: g.id, before: { name: g.name, slug: g.slug, description: g.description }, after: { name: spec.name[1], slug, description } };
  });

  // Productos: nombre y descripción
  const productById = new Map(snap.products.map((p) => [p.id, p]));
  if (snap.products.length !== PRODUCTS.length) fail(`productos: se esperaban ${PRODUCTS.length}, hay ${snap.products.length}`);
  const draft = PRODUCTS.map((spec) => {
    const p = productById.get(spec.id);
    if (!p) throw new Error(`producto ${spec.id} no existe`);
    if (p.name !== spec.name[0]) fail(`producto ${spec.id}: nombre actual ${JSON.stringify(p.name)}`);
    return { spec, p, name: spec.name[1], description: applyDescription(p.description, spec.description, `producto ${p.name.trim()}`) };
  });

  // La réplica del algoritmo tiene que reproducir los slugs actuales.
  const replicaMismatches = [];
  const members = new Map();
  for (const row of snap.groupMembers) {
    if (!members.has(row.productGroupId)) members.set(row.productGroupId, []);
    members.get(row.productGroupId).push(row.id);
  }
  for (const [groupId, ids] of members) {
    if (ids.some((id) => !productById.has(id))) fail(`grupo ${groupId}: tiene variantes fuera de la lista`);
  }

  // Productos: slugs nuevos, como synchronizeProductGroupSlugs / getUniqueProductSlug.
  const touched = new Set(PRODUCTS.map((p) => p.id));
  const reservedBase = new Set([
    ...snap.productSlugs.filter((row) => !touched.has(row.id)).map((row) => row.slug),
    ...snap.deletedUrls.map((row) => row.slug),
  ]);
  const aliasOwner = new Map(snap.aliases.map((row) => [row.slug, row.productId]));
  const nextSlugs = new Set();
  const newSlugById = new Map();
  const groupOrder = [...members.keys()].sort();
  for (const groupId of groupOrder) {
    const groupProducts = draft.filter((row) => row.p.productGroupId === groupId).sort((a, b) => (a.p.id < b.p.id ? -1 : 1));
    const inclusion = getVariantSlugAttributeInclusion(groupProducts.map((row) => row.p));
    for (const row of groupProducts) {
      const attrs = { color: row.p.color, design: row.p.design, size: row.p.size, includeVariantAttributes: groupProducts.length > 1, variantAttributes: inclusion };
      const oldReplica = generateProductSlug({ ...attrs, name: row.p.name });
      if (oldReplica !== row.p.slug) replicaMismatches.push({ id: row.p.id, actual: row.p.slug, replica: oldReplica });
      const reserved = new Set([...reservedBase, ...aliasOwner.keys(), ...nextSlugs]);
      const slug = buildUniqueSlug(generateProductSlug({ ...attrs, name: row.name }), reserved);
      nextSlugs.add(slug);
      newSlugById.set(row.p.id, slug);
    }
  }
  for (const row of draft.filter((r) => !r.p.productGroupId)) {
    const oldReplica = generateProductSlug({ name: row.p.name });
    if (oldReplica !== row.p.slug) replicaMismatches.push({ id: row.p.id, actual: row.p.slug, replica: oldReplica });
    if (row.p.name === row.name) {
      newSlugById.set(row.p.id, row.p.slug);
      continue;
    }
    const base = generateProductSlug({ name: row.name });
    const reserved = new Set([...reservedBase, ...nextSlugs, ...[...aliasOwner].filter(([, owner]) => owner !== row.p.id).map(([slug]) => slug)]);
    const slug = buildUniqueSlug(base, reserved);
    nextSlugs.add(slug);
    newSlugById.set(row.p.id, slug);
  }

  const products = draft.map((row) => ({
    id: row.p.id,
    isArchived: row.p.isArchived,
    productGroupId: row.p.productGroupId,
    before: { name: row.p.name, slug: row.p.slug, description: row.p.description },
    after: { name: row.name, slug: newSlugById.get(row.p.id), description: row.description },
  }));

  // Alias de producto: el slug viejo de cada producto que cambia de slug.
  const productAliases = [];
  for (const row of products) {
    if (row.before.slug === row.after.slug) continue;
    const owner = aliasOwner.get(row.before.slug);
    if (owner && owner !== row.id) fail(`alias ${row.before.slug}: ya apunta a otro producto (${owner})`);
    if (!owner) productAliases.push({ productId: row.id, slug: row.before.slug });
  }

  // Colisiones de los slugs nuevos.
  const collisions = [];
  const seen = new Map();
  for (const row of products) {
    const slug = row.after.slug;
    if (row.after.slug !== row.before.slug) {
      if (reservedBase.has(slug)) collisions.push({ slug, with: "Product/DeletedProductUrl" });
      if (aliasOwner.has(slug)) collisions.push({ slug, with: `ProductSlugAlias→${aliasOwner.get(slug)}` });
      if (!slug.startsWith(CATEGORY.slug[1]) && !slug.startsWith("tajalapiz-de-bloques") && row.after.name !== row.before.name) collisions.push({ slug, with: "prefijo inesperado" });
    }
    if (seen.has(slug)) collisions.push({ slug, with: `lote (${seen.get(slug)})` });
    seen.set(slug, row.id);
  }
  for (const alias of productAliases) if (nextSlugs.has(alias.slug)) collisions.push({ slug: alias.slug, with: "alias nuevo = slug nuevo" });

  return { problems, replicaMismatches, collisions, plan: { storeId: STORE_ID, category, categoryAliases, design, groups, products, productAliases } };
}

/** Lo que verían la tienda, JSON-LD y los feeds con los valores nuevos. */
function deriveVisible(plan, snap) {
  const typeName = snap.category.type?.name || "";
  const productType = `${typeName} > ${plan.category.after.name}`;
  const byId = new Map(snap.products.map((p) => [p.id, p]));
  const live = plan.products.filter((row) => !row.isArchived);
  return live.map((row) => {
    const p = byId.get(row.id);
    const siblings = row.productGroupId ? live.filter((other) => other.productGroupId === row.productGroupId).map((other) => byId.get(other.id)) : [];
    const name = row.after.name.replace(/\s+/g, " ").trim();
    const attributes =
      siblings.length < 2
        ? []
        : [(x) => x.design?.name, (x) => x.color?.name]
            .filter((get) => new Set(siblings.map((s) => get(s) ?? "")).size > 1)
            .map((get) => get(p))
            .filter((value) => value && !fold(name).includes(fold(value)));
    const own = plain(row.after.description);
    const prefix = attributes.length ? `${attributes.join(", ")}. ` : siblings.length > 1 && !fold(own).startsWith(fold(name)) ? `${name}. ` : "";
    const metaDescription = own ? truncate(`${prefix}${own}`, META_DESCRIPTION_MAX_LENGTH) : "(precio y envío)";
    const titleCore = attributes.length ? `${name} - ${attributes.join(", ")}` : name;
    const metaTitle = `${titleCore} | P de Papel`.length <= 60 ? `${titleCore} | P de Papel` : titleCore;
    const group = row.productGroupId ? plan.groups.find((g) => g.id === row.productGroupId) : null;
    return {
      id: row.id,
      h1AndAlt: name,
      metaTitle,
      metaDescription,
      jsonLdName: name,
      jsonLdGroupName: group?.after.name ?? null,
      jsonLdDescription: truncate(own || name, META_DESCRIPTION_MAX_LENGTH),
      jsonLdBrand: p.brand || null,
      feedTitle: name,
      feedDescription: own || name,
      feedBrandGoogle: p.brand || "",
      feedBrandMeta: p.brand || "P de Papel",
      feedProductType: productType,
      legoIndexInDescription: own.search(/lego/i),
    };
  });
}

function occurrences(plan, visible, snap) {
  const count = (values) => values.filter((value) => value && LEGO.test(value)).length;
  return {
    "Category.name": count([plan.category.after.name]),
    "Category.slug": count([plan.category.after.slug]),
    "Category.seoTitle": count([snap.category.seoTitle]),
    "Category.seoDescription": count([snap.category.seoDescription]),
    "Category.seoIntro (aviso final)": count([plan.category.seoIntro.after]),
    "CategorySlugAlias.slug (solo URL)": plan.categoryAliases.length,
    "Design.name": count([plan.design.after.name]),
    "ProductGroup.name": count(plan.groups.map((g) => g.after.name)),
    "ProductGroup.slug": count(plan.groups.map((g) => g.after.slug)),
    "ProductGroup.description (aviso)": count(plan.groups.map((g) => g.after.description)),
    "Product.name": count(plan.products.map((p) => p.after.name)),
    "Product.slug": count(plan.products.map((p) => p.after.slug)),
    "Product.brand/gtin/mpn": count(snap.products.flatMap((p) => [p.brand, p.gtin, p.mpn])),
    "Product.description (aviso)": count(plan.products.map((p) => p.after.description)),
    "ProductSlugAlias.slug nuevos (solo URL)": plan.productAliases.length,
    "Vivos · H1 / alt de imagen": count(visible.map((v) => v.h1AndAlt)),
    "Vivos · meta title": count(visible.map((v) => v.metaTitle)),
    "Vivos · meta description (160)": count(visible.map((v) => v.metaDescription)),
    "Vivos · JSON-LD name (producto y grupo)": count(visible.flatMap((v) => [v.jsonLdName, v.jsonLdGroupName])),
    "Vivos · JSON-LD brand": count(visible.map((v) => v.jsonLdBrand)),
    "Vivos · JSON-LD description (160)": count(visible.map((v) => v.jsonLdDescription)),
    "Vivos · Merchant/Meta title": count(visible.map((v) => v.feedTitle)),
    "Vivos · Merchant brand / Meta brand": count(visible.flatMap((v) => [v.feedBrandGoogle, v.feedBrandMeta])),
    "Vivos · Merchant/Meta product_type": count(visible.map((v) => v.feedProductType)),
    "Vivos · Merchant/Meta description (≤5000; aviso, ver propuesta del feed)": count(visible.map((v) => v.feedDescription)),
  };
}

function renderPlanMarkdown({ plan, visible, occ, replicaMismatches, collisions, backupPath }) {
  const out = [];
  const q = (value) => (value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "⏎");
  out.push(`# Ensayo: Lego → Bloques de construcción`, "", `Copia: ${backupPath}`, "");
  out.push(`## Categoría`, "", `| campo | antes | después |`, `|---|---|---|`);
  out.push(`| name | ${plan.category.before.name} | ${plan.category.after.name} |`, `| slug | ${plan.category.before.slug} | ${plan.category.after.slug} |`);
  out.push(`| alias nuevo | — | ${plan.categoryAliases.map((a) => a.slug).join(", ")} |`, "");
  out.push(`### seoIntro (${plan.category.seoIntro.after.length} caracteres)`, "", plan.category.seoIntro.after, "");
  out.push(`## Diseño`, "", `${plan.design.before.name} → ${plan.design.after.name}`, "");
  out.push(`## Grupos`, "", `| id | nombre antes → después | slug antes → después |`, `|---|---|---|`);
  for (const g of plan.groups) out.push(`| ${g.id.slice(0, 8)} | ${q(g.before.name)} → ${q(g.after.name)} | ${g.before.slug} → ${g.after.slug} |`);
  out.push("", `## Productos`, "", `| id | estado | nombre antes → después | slug antes → después |`, `|---|---|---|---|`);
  for (const p of plan.products) out.push(`| ${p.id.slice(0, 8)} | ${p.isArchived ? "archivado" : "**vivo**"} | ${q(p.before.name)} → ${q(p.after.name)} | ${p.before.slug} → ${p.after.slug} |`);
  out.push("", `## Descripciones (antes → después)`, "");
  for (const row of [...plan.groups.filter((g) => g.before.description !== g.after.description), ...plan.products]) {
    if (row.before.description === row.after.description) continue;
    out.push(`### ${row.after.name} (${row.id.slice(0, 8)})`, "", "Antes:", "", "```", row.before.description || "(vacía)", "```", "Después:", "", "```", row.after.description, "```", "");
  }
  out.push(`## Alias de producto nuevos (${plan.productAliases.length})`, "");
  for (const a of plan.productAliases) out.push(`- ${a.slug} → ${plan.products.find((p) => p.id === a.productId).after.slug}`);
  out.push("", `## Campos visibles de los 7 vivos`, "", `| producto | meta title | meta description | índice de «Lego» en el texto plano |`, `|---|---|---|---|`);
  for (const v of visible) out.push(`| ${q(v.feedTitle)} | ${q(v.metaTitle)} | ${q(v.metaDescription)} | ${v.legoIndexInDescription} |`);
  out.push("", `## Ocurrencias de «lego» después del cambio`, "", `| campo | filas |`, `|---|---|`);
  for (const [field, n] of Object.entries(occ)) out.push(`| ${field} | ${n} |`);
  out.push("", `Réplica de slugs distinta del valor actual: ${replicaMismatches.length}`, `Colisiones: ${collisions.length}`);
  return out.join("\n");
}

// ── Escritura ───────────────────────────────────────────────────────────────
async function assertNoCollisions(tx, plan, direction) {
  const rows = direction === "apply" ? plan.products : plan.products.map((p) => ({ ...p, before: p.after, after: p.before }));
  const changed = rows.filter((p) => p.before.slug !== p.after.slug);
  const targetSlugs = changed.map((p) => p.after.slug);
  const ids = plan.products.map((p) => p.id);
  const [productClash, aliasClash, deletedClash] = await Promise.all([
    tx.product.findMany({ where: { storeId: STORE_ID, slug: { in: targetSlugs }, NOT: { id: { in: ids } } }, select: { id: true, slug: true } }),
    tx.productSlugAlias.findMany({ where: { storeId: STORE_ID, slug: { in: targetSlugs } }, select: { productId: true, slug: true } }),
    tx.deletedProductUrl.findMany({ where: { storeId: STORE_ID, slug: { in: targetSlugs } }, select: { slug: true } }),
  ]);
  // Al revertir, los alias que se van a borrar todavía existen cuando se mira.
  const pendingDeletes = new Set(direction === "revert" ? plan.productAliases.map((a) => `${a.productId}:${a.slug}`) : []);
  // Un alias que ya era del mismo producto no estorba (la tienda redirige al slug).
  const ownerOf = new Map(changed.map((p) => [p.after.slug, p.id]));
  const aliasConflicts = aliasClash.filter((a) => !pendingDeletes.has(`${a.productId}:${a.slug}`) && ownerOf.get(a.slug) !== a.productId);
  if (productClash.length || aliasConflicts.length || deletedClash.length) {
    throw new Error(`colisión de slug dentro de la transacción: ${JSON.stringify({ productClash, aliasConflicts, deletedClash })}. No se escribió nada.`);
  }
}

async function updateOne(tx, model, id, before, after, label) {
  const result = await tx[model].updateMany({ where: { id, storeId: STORE_ID, ...before }, data: after });
  if (result.count !== 1) throw new Error(`${label} ${id}: se esperaba 1 fila con los valores de la copia, cambiaron ${result.count}. No se escribió nada.`);
  return 1;
}

async function writePlan(db, plan, direction) {
  const flip = (row) => (direction === "apply" ? [row.before, row.after] : [row.after, row.before]);
  return db.$transaction(
    async (tx) => {
      let rows = 0;
      await assertNoCollisions(tx, plan, direction);
      if (direction === "revert") {
        const deletedAliases = await tx.productSlugAlias.deleteMany({
          where: { storeId: STORE_ID, OR: plan.productAliases.map((a) => ({ productId: a.productId, slug: a.slug })) },
        });
        if (deletedAliases.count !== plan.productAliases.length) throw new Error(`alias de producto: se esperaban ${plan.productAliases.length}, se borraron ${deletedAliases.count}. No se escribió nada.`);
        const deletedCategoryAlias = await tx.categorySlugAlias.deleteMany({
          where: { storeId: STORE_ID, OR: plan.categoryAliases.map((a) => ({ categoryId: a.categoryId, slug: a.slug })) },
        });
        if (deletedCategoryAlias.count !== plan.categoryAliases.length) throw new Error(`alias de categoría: se borraron ${deletedCategoryAlias.count}. No se escribió nada.`);
        rows += deletedAliases.count + deletedCategoryAlias.count;
      }

      const [categoryBefore, categoryAfter] = flip(plan.category);
      const [introBefore, introAfter] = flip(plan.category.seoIntro);
      rows += await updateOne(tx, "category", plan.category.id, { ...categoryBefore, seoIntro: introBefore }, { ...categoryAfter, seoIntro: introAfter }, "categoría");
      rows += await updateOne(tx, "design", plan.design.id, ...flip(plan.design), "diseño");
      for (const g of plan.groups) rows += await updateOne(tx, "productGroup", g.id, ...flip(g), "grupo");
      for (const p of plan.products) rows += await updateOne(tx, "product", p.id, ...flip(p), "producto");

      if (direction === "apply") {
        const createdCategoryAlias = await tx.categorySlugAlias.createMany({ data: plan.categoryAliases.map((a) => ({ storeId: STORE_ID, ...a })) });
        if (createdCategoryAlias.count !== plan.categoryAliases.length) throw new Error("alias de categoría: la cuenta no cuadra. No se escribió nada.");
        const createdAliases = await tx.productSlugAlias.createMany({ data: plan.productAliases.map((a) => ({ storeId: STORE_ID, ...a })) });
        if (createdAliases.count !== plan.productAliases.length) throw new Error(`alias de producto: se esperaban ${plan.productAliases.length}, se crearon ${createdAliases.count}. No se escribió nada.`);
        rows += createdCategoryAlias.count + createdAliases.count;
      }
      return rows;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

// ── Principal ───────────────────────────────────────────────────────────────
const [mode = "--dry-run", backupArg] = process.argv.slice(2);
if (!["--dry-run", "--apply", "--revert"].includes(mode)) throw new Error("uso: [--dry-run] | --apply <copia.json> | --revert <copia.json>");
if (mode !== "--dry-run" && !backupArg) throw new Error(`${mode} necesita la copia de respaldo del ensayo`);

let db;
if (mode === "--dry-run") {
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient();
} else {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
}

try {
  if (mode === "--dry-run") {
    const snap = await readSnapshot(db);
    const { problems, replicaMismatches, collisions, plan } = buildPlan(snap);
    const visible = deriveVisible(plan, snap);
    const occ = occurrences(plan, visible, snap);
    const leaks = Object.entries(occ).filter(([field, n]) => n > 0 && !/aviso|solo URL/.test(field));
    if (problems.length || collisions.length || replicaMismatches.length || leaks.length) {
      console.log(JSON.stringify({ problems, collisions, replicaMismatches, leaks }, null, 1));
      throw new Error("el plan no pasa las comprobaciones: no se guarda copia");
    }
    const takenAt = new Date().toISOString();
    const dir = join(homedir(), "pdepapel-backups", takenAt.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    const stamp = takenAt.replace(/[:.]/g, "-");
    const backupPath = join(dir, `rename-lego-${stamp}.json`);
    writeFileSync(backupPath, JSON.stringify({ takenAt, plan }, null, 1), { mode: 0o600 });
    const planPath = join(dir, `rename-lego-${stamp}.md`);
    writeFileSync(planPath, renderPlanMarkdown({ plan, visible, occ, replicaMismatches, collisions, backupPath }), { mode: 0o600 });
    console.log(
      JSON.stringify(
        {
          mode,
          rows: {
            category: 1,
            categoryAliases: plan.categoryAliases.length,
            design: 1,
            groups: plan.groups.length,
            products: plan.products.length,
            productsLive: plan.products.filter((p) => !p.isArchived).length,
            productAliases: plan.productAliases.length,
            total: 2 + plan.groups.length + plan.products.length + plan.categoryAliases.length + plan.productAliases.length,
          },
          seoIntroLength: plan.category.seoIntro.after.length,
          replicaMismatches: replicaMismatches.length,
          collisions: collisions.length,
          occurrences: occ,
          backup: backupPath,
          plan: planPath,
        },
        null,
        1,
      ),
    );
  } else {
    const backup = JSON.parse(readFileSync(backupArg, "utf8"));
    if (backup.plan?.storeId !== STORE_ID) throw new Error("la copia no corresponde a esta tienda");
    if (mode === "--apply") {
      const { problems, collisions, plan } = buildPlan(await readSnapshot(db));
      if (problems.length || collisions.length) throw new Error(`la base cambió desde el ensayo: ${JSON.stringify({ problems, collisions })}. No se escribió nada.`);
      if (!isDeepStrictEqual(plan, backup.plan)) throw new Error("el plan de hoy no es idéntico al de la copia (la base o el guion cambiaron). Repite el ensayo. No se escribió nada.");
    }
    const started = Date.now();
    const rows = await writePlan(db, backup.plan, mode === "--apply" ? "apply" : "revert");
    const elapsedMs = Date.now() - started;
    const check = await db.category.findFirst({ where: { id: CATEGORY.id }, select: { name: true, slug: true } });
    console.log(`PROD_WRITE_ROWS=${rows}`);
    console.log(JSON.stringify({ mode, rows, elapsedMs, category: check }, null, 1));
  }
} finally {
  await db.$disconnect();
}
