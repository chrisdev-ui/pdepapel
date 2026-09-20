import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia de regresión para las **lecturas** del panel, hermano de
 * `write-auth-scan.test.ts`.
 *
 * Toda carga de servidor de una pantalla del panel que consulte la base tiene
 * que decir a quién deja entrar: `requireStoreOwner` cuando enseña dinero de
 * la casa o datos personales, `requireStoreRead` (o `getStoreAccess`) cuando
 * la abre a una cuenta de solo lectura, o la comprobación de propiedad en
 * línea (`where: { id, userId }` + redirección).
 *
 * Existe porque el barrido a ojo falló en las dos direcciones: dio por
 * cerrado Rendimiento —el guardia estaba, pero solo en la pestaña de Envíos,
 * y la de «Resumen y caja» enseñaba ventas netas, utilidad y retiro
 * personal—, y dio por abierto Boletín, que sí estaba cerrado con el ayudante
 * antiguo. Un grep por archivo no distingue ninguno de los dos casos; esta
 * prueba sí, porque exige que cada excepción esté escrita con su motivo.
 */
const ROOT = path.resolve(__dirname, "../..", "..");
const ROUTES = path.join(ROOT, "app", "(dashboard)", "[storeId]", "(routes)");

const GUARDS = [
  "requireStoreOwner",
  "requireStoreRead",
  "getStoreAccess",
  "verifyStoreOwner",
  "checkIfStoreOwner",
  "requireInviter",
  "isAllowlistedOwner",
];

/** `prismadb.store.findFirst({ where: { id, userId } })` + `redirect`. */
const INLINE_OWNERSHIP = /where:\s*\{[^}]*userId/;

/**
 * Cargas que consultan la base sin guardia **a propósito**, con el motivo.
 *
 * Solo entra aquí lo que no puede filtrar dinero de la casa ni datos
 * personales: catálogo y atributos que la tienda en línea ya publica, el
 * nombre de la tienda, o un id que solo sirve para redirigir. Si una carga
 * nueva no cabe en esa frase, lleva guardia, no línea en esta lista.
 */
const ALLOWED_WITHOUT_GUARD: Record<string, string> = {
  // Atributos y catálogo: la tienda en línea ya los publica.
  "atributos/page.tsx": "colores, tamaños, diseños y tipos; el catálogo público ya los muestra",
  "categorias/[categoryId]/page.tsx": "una categoría del catálogo público",
  "colores/[colorId]/page.tsx": "un color del catálogo público",
  "disenos/[designId]/page.tsx": "un diseño del catálogo público",
  "tamanos/[sizeId]/page.tsx": "un tamaño del catálogo público",
  "tipos/[typeId]/page.tsx": "un tipo del catálogo público",
  "cajas/[boxId]/page.tsx": "medidas de una caja de envío; ni dinero ni personas",
  // Productos: la carga sensible (costos) va depurada por `scrubProduct`.
  "productos/page.tsx": "lista de productos; los campos internos los quita scrubProduct",
  "productos/server/get-product-groups.ts": "grupos de productos; se depuran con scrubProductGroups",
  "productos/grupo/[productGroupId]/page.tsx": "un grupo de productos, depurado con scrubProductGroup",
  "productos/nuevo-grupo/page.tsx": "catálogo para armar un grupo nuevo",
  // Promociones: ya abiertas en la fase 1, sin costos ni personas.
  "ofertas/server/get-offers.ts": "ofertas; abiertas a solo lectura en la fase 1",
  "ofertas/[offerId]/server/get-offer.ts": "una oferta; abierta a solo lectura en la fase 1",
  "ofertas/[offerId]/server/get-offer-picker.ts": "buscador de alcance de una oferta",
  "ferias/page.tsx": "lista de ferias; el detalle sí va depurado con scrubFairEvent",
  // Lecturas de una sola columna, o el nombre de la tienda.
  "clientes/[customerId]/page.tsx": "solo el nombre de la tienda; el detalle va por getCustomerDetail, que sí exige dueña",
  "envios/[shippingId]/page.tsx": "solo el orderId, para redirigir al pedido",
  "inventario/page.tsx": "solo el umbral de stock bajo; las filas van por getInventory, que sí tiene guardia",
  "mercadolibre/page.tsx": "estado de la conexión; abierto a solo lectura en la fase 1",
};

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Páginas de servidor y cargas bajo `server/`: lo que corre en el servidor. */
function serverLoaders(): string[] {
  return walk(ROUTES).filter((file) => {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return false;
    const relative = path.relative(ROUTES, file).split(path.sep).join("/");
    return relative.endsWith("page.tsx") || relative.includes("/server/");
  });
}

const readsDatabase = (source: string) => /prismadb\??\./.test(source);
const hasGuard = (source: string) =>
  GUARDS.some((guard) => source.includes(`${guard}(`)) || INLINE_OWNERSHIP.test(source);

describe("toda lectura del panel dice a quién deja entrar", () => {
  const loaders = serverLoaders();

  it("encuentra las cargas de servidor del panel", () => {
    expect(loaders.length).toBeGreaterThan(50);
  });

  it("ninguna carga que consulte la base se queda sin guardia", () => {
    const unguarded: string[] = [];
    for (const file of loaders) {
      const relative = path.relative(ROUTES, file).split(path.sep).join("/");
      const source = readFileSync(file, "utf8");
      if (!readsDatabase(source)) continue;
      if (hasGuard(source)) continue;
      if (ALLOWED_WITHOUT_GUARD[relative]) continue;
      unguarded.push(relative);
    }
    expect(unguarded).toEqual([]);
  });

  it("cada excepción sigue existiendo y sigue sin guardia", () => {
    for (const [relative, reason] of Object.entries(ALLOWED_WITHOUT_GUARD)) {
      const file = path.join(ROUTES, relative);
      const source = readFileSync(file, "utf8");
      expect(readsDatabase(source), `${relative} ya no consulta la base: quítala de la lista`).toBe(true);
      expect(hasGuard(source), `${relative} ya tiene guardia: quítala de la lista (${reason})`).toBe(false);
    }
  });

  /**
   * Lo que se le escapó al barrido a ojo. Cada una de estas pantallas enseña
   * dinero de la casa o datos personales, así que la dueña es la única.
   */
  it.each([
    ["rendimiento/page.tsx", "ventas netas, utilidad y retiro personal"],
    ["negocio/page.tsx", "el mismo resumen de caja, en su propia ruta"],
    ["inteligencia-negocio/page.tsx", "margen por producto e inventario muerto"],
    ["ventas-rapidas/page.tsx", "el punto de venta escribe de principio a fin"],
    ["conversaciones/[conversationId]/server/get-conversation.ts", "teléfono, nombre y el hilo entero"],
    ["pedidos/[orderId]/server/get-available-customers.ts", "nombre, correo, teléfono y documento"],
    ["boletin/server/get-newsletter-subscribers.ts", "correos de las suscriptoras"],
    ["conversaciones/respuestas/server/get-business-facts.ts", "no puede depender de que reviente un hermano"],
    ["conversaciones/respuestas/server/get-product-answers.ts", "no puede depender de que reviente un hermano"],
    ["clientes/server/get-customers.ts", "nombre y teléfono de cada clienta"],
  ])("%s exige la dueña (%s)", (relative) => {
    const source = readFileSync(path.join(ROUTES, relative), "utf8");
    expect(source).toContain("requireStoreOwner(");
  });

  /** Pantallas que sí ve una cuenta de solo lectura, siempre depuradas. */
  it.each([
    ["inventario/server/get-inventory.ts", "scrubInventoryRows"],
    ["envios/server/get-shipments.ts", "scrubShipments"],
    ["preventas/server/get-presales.ts", "scrubPresales"],
    ["resenas/server/get-reviews.ts", "scrubReview"],
  ])("%s abre la lectura pero depura (%s)", (relative, scrubber) => {
    const source = readFileSync(path.join(ROUTES, relative), "utf8");
    expect(source).toContain("requireStoreRead(");
    expect(source).toContain(scrubber);
  });
});
