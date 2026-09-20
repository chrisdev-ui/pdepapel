import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia de regresión para las **lecturas** del panel, hermano de
 * `write-auth-scan.test.ts`.
 *
 * La primera versión miraba una sola cosa: si el archivo escribía `prismadb.`
 * y no tenía guardia. Eso dejó pasar dos fugas hasta producción:
 *
 * 1. **Ferias.** `ferias/[fairEventId]/page.tsx` no nombra `prismadb`: llega a
 *    la base por `lib/fair-events.ts`. El escaneo no seguía los imports, así
 *    que no la veía, y la página entregaba el costo de compra al navegador.
 * 2. **Grupos de productos.** `productos/grupo/[productGroupId]/page.tsx` sí
 *    tenía entrada en la lista de excepciones… con el motivo «depurado con
 *    scrubProductGroup», que **nunca fue cierto**. La prosa de la excepción no
 *    se comprobaba contra el archivo, así que una frase confiada convirtió una
 *    fuga viva en un permiso permanente.
 *
 * De ahí las cuatro comprobaciones de abajo. La que más importa es la tercera:
 * una excepción ya no dice «está bien porque sí», declara **con qué mecanismo**
 * está protegida y la prueba verifica que ese mecanismo exista de verdad.
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
 * Campos que no pueden viajar al navegador de una cuenta de solo lectura:
 * dinero de la casa y datos personales. Es la misma idea de
 * `lib/viewer-payloads.ts`, escrita como nombres sueltos porque el escaneo
 * mira texto, no tipos.
 */
const SENSITIVE_FIELDS = [
  "acqPrice",
  "transportationCost",
  "supplierId",
  "abcClassification",
  "soldCount",
  "netProfit",
  "totalProductCost",
  "gatewayFee",
  "profitMarginPct",
  "productCost",
  "minimumMarginPct",
  "minimumMarginAmount",
  "nit",
  "contactName",
  "documentId",
  "buyerName",
  "trackingCode",
  "adminNotes",
  "internalNotes",
];

/**
 * Relaciones que, traídas con `include` y sin `select`, devuelven todos los
 * escalares del modelo. Es la trampa que causó la fuga de los grupos: las
 * variantes venían con `include` y arrastraban `acqPrice` y el proveedor.
 */
const WIDE_RELATIONS = ["products", "product", "variants", "supplier", "orders", "orderItems"];

type Mechanism = "narrow-select" | "owner-guard" | "scrubbed" | "public-catalog";

interface Exception {
  reason: string;
  mechanism: Mechanism;
}

/**
 * Excepciones, con el mecanismo que de verdad las protege. La prueba comprueba
 * el mecanismo declarado contra el archivo: decir «scrubbed» sin una llamada a
 * `scrub*` hace fallar la suite, que es justo lo que no pasó con los grupos.
 */
const ALLOWED: Record<string, Exception> = {
  "atributos/page.tsx": {
    reason: "colores, tamaños, diseños y tipos que el catálogo público ya publica",
    mechanism: "public-catalog",
  },
  "categorias/[categoryId]/page.tsx": {
    reason: "una categoría del catálogo público",
    mechanism: "public-catalog",
  },
  "colores/[colorId]/page.tsx": { reason: "un color del catálogo público", mechanism: "public-catalog" },
  "disenos/[designId]/page.tsx": { reason: "un diseño del catálogo público", mechanism: "public-catalog" },
  "tamanos/[sizeId]/page.tsx": { reason: "un tamaño del catálogo público", mechanism: "public-catalog" },
  "tipos/[typeId]/page.tsx": { reason: "un tipo del catálogo público", mechanism: "public-catalog" },
};

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sources = new Map<string, string>();
function read(file: string): string {
  if (!sources.has(file)) {
    try {
      sources.set(file, readFileSync(file, "utf8"));
    } catch {
      sources.set(file, "");
    }
  }
  return sources.get(file) as string;
}

const isFile = (candidate: string): boolean => {
  try {
    return Boolean(statSync(candidate, { throwIfNoEntry: false })?.isFile());
  } catch {
    return false;
  }
};

/** `@/lib/x` y `./y` a un archivo del repositorio; lo de `node_modules` se ignora. */
function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  if (isFile(base)) return base;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (isFile(base + ext)) return base + ext;
  }
  return null;
}

const importsOf = (file: string): string[] =>
  Array.from(read(file).matchAll(/from\s+["']([^"']+)["']/g))
    .map((match) => resolveImport(match[1], file))
    .filter((found): found is string => Boolean(found));

const touchesDatabase = (source: string) => /prismadb\??\./.test(source);

/**
 * **Comprobación 1.** La carga y todo lo que importa hasta dos saltos: si algo
 * de ahí toca la base, la pantalla lee la base, aunque su archivo no nombre
 * `prismadb` ni una vez. Sin esto, Ferias era invisible.
 */
function pathFiles(file: string, depth = 2): string[] {
  const found = [file];
  const seen = new Set<string>([file]);
  const visit = (current: string, left: number) => {
    if (left < 0) return;
    for (const dep of importsOf(current)) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      if (touchesDatabase(read(dep))) found.push(dep);
      visit(dep, left - 1);
    }
  };
  visit(file, depth);
  return found;
}

const hasGuard = (source: string) =>
  GUARDS.some((guard) => source.includes(`${guard}(`)) || INLINE_OWNERSHIP.test(source);
const hasScrub = (source: string) => /\bscrub[A-Z]\w*\(/.test(source);
const sensitiveIn = (source: string) =>
  SENSITIVE_FIELDS.filter((field) => new RegExp(`\\b${field}\\b`).test(source));

/**
 * **Comprobación 2.** `include:` que arrastra una relación entera sin `select`.
 * Un `_count: { select: { products: true } }` es un conteo, no las filas, así
 * que se descarta antes de mirar.
 */
function wideIncludes(source: string): string[] {
  const hits: string[] = [];
  const opener = /\binclude:\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
      if (source[index] === "{") depth += 1;
      else if (source[index] === "}") depth -= 1;
      index += 1;
    }
    const block = source.slice(match.index, index).replace(/_count:\s*\{[\s\S]*?\}\s*\}/g, "");
    for (const relation of WIDE_RELATIONS) {
      const keyed = new RegExp(`\\b${relation}:\\s*(true|\\{)`).exec(block);
      if (!keyed) continue;
      if (keyed[1] === "true") {
        hits.push(`${relation}: true`);
        continue;
      }
      const start = block.indexOf("{", keyed.index + keyed[0].length - 1);
      let cursor = start + 1;
      let inner = 1;
      while (cursor < block.length && inner > 0) {
        if (block[cursor] === "{") inner += 1;
        else if (block[cursor] === "}") inner -= 1;
        cursor += 1;
      }
      if (!/\bselect:\s*\{/.test(block.slice(start, cursor))) {
        hits.push(`${relation}: include sin select`);
      }
    }
  }
  return Array.from(new Set(hits));
}

interface Loader {
  relative: string;
  files: string[];
  texts: string[];
  guarded: boolean;
  ownerOnly: boolean;
  readOpen: boolean;
  scrubbed: boolean;
  sensitive: string[];
  wide: string[];
}

function loaders(): Loader[] {
  const candidates = walk(ROUTES).filter((file) => {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return false;
    const relative = path.relative(ROUTES, file).split(path.sep).join("/");
    return relative.endsWith("page.tsx") || relative.includes("/server/");
  });
  return candidates
    .map((file) => {
      const files = pathFiles(file);
      const texts = files.map(read);
      return {
        relative: path.relative(ROUTES, file).split(path.sep).join("/"),
        files,
        texts,
        guarded: texts.some(hasGuard),
        ownerOnly: texts.some((text) => text.includes("requireStoreOwner(")),
        readOpen: texts.some(
          (text) => text.includes("requireStoreRead(") || text.includes("getStoreAccess("),
        ),
        scrubbed: texts.some(hasScrub),
        sensitive: Array.from(new Set(texts.flatMap(sensitiveIn))),
        wide: Array.from(new Set(texts.flatMap(wideIncludes))),
      };
    })
    .filter((loader) => loader.texts.some(touchesDatabase));
}

describe("toda lectura del panel dice a quién deja entrar", () => {
  const all = loaders();

  it("encuentra las cargas de servidor del panel", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it("sigue los imports: una página que llega a la base por lib/ también cuenta", () => {
    const ferias = all.find((loader) => loader.relative === "ferias/[fairEventId]/page.tsx");
    expect(ferias, "la ficha de una feria tiene que entrar en el escaneo").toBeDefined();
    // Su propio archivo no nombra `prismadb`: llega por `lib/fair-events.ts`.
    expect(touchesDatabase(read(ferias!.files[0]))).toBe(false);
    expect(ferias!.files.length).toBeGreaterThan(1);
  });

  it("ninguna carga se queda sin guardia en toda su ruta", () => {
    const unguarded = all
      .filter((loader) => !loader.guarded && !ALLOWED[loader.relative])
      .map((loader) => loader.relative);
    expect(unguarded).toEqual([]);
  });

  /**
   * **El corazón.** Si la pantalla la puede abrir una cuenta de solo lectura y
   * sus datos traen dinero de la casa o datos personales, alguien en la ruta
   * tiene que depurarlos. Aquí caen Rendimiento, Ferias y los grupos.
   */
  it("lo que ve una cuenta de solo lectura va depurado", () => {
    const leaking = all
      .filter((loader) => {
        if (ALLOWED[loader.relative]) return false;
        const risky = loader.sensitive.length > 0 || loader.wide.length > 0;
        return risky && loader.readOpen && !loader.ownerOnly && !loader.scrubbed;
      })
      .map((loader) => `${loader.relative} → ${[...loader.sensitive, ...loader.wide].join(", ")}`);
    expect(leaking).toEqual([]);
  });

  /** **Comprobación 3.** El mecanismo declarado existe de verdad en el archivo. */
  it("cada excepción declara un mecanismo y el mecanismo se cumple", () => {
    for (const [relative, exception] of Object.entries(ALLOWED)) {
      const file = path.join(ROUTES, relative);
      expect(isFile(file), `${relative} ya no existe: quítala de la lista`).toBe(true);
      const source = read(file);
      const label = `${relative} (${exception.mechanism}: ${exception.reason})`;
      if (exception.mechanism === "owner-guard") {
        expect(source.includes("requireStoreOwner("), `${label} dice owner-guard y no lo tiene`).toBe(
          true,
        );
      }
      if (exception.mechanism === "scrubbed") {
        expect(hasScrub(source), `${label} dice scrubbed y no llama a ningún scrub*`).toBe(true);
      }
      if (exception.mechanism === "narrow-select" || exception.mechanism === "public-catalog") {
        expect(sensitiveIn(source), `${label} trae campos sensibles`).toEqual([]);
        expect(wideIncludes(source), `${label} trae un include sin select`).toEqual([]);
      }
    }
  });

  /** Lo que se le escapó al barrido a ojo, fijado una por una. */
  it.each([
    ["rendimiento/page.tsx", "ventas netas, utilidad y retiro personal"],
    ["negocio/page.tsx", "el mismo resumen de caja en su propia ruta"],
    ["inteligencia-negocio/page.tsx", "margen por producto e inventario muerto"],
    ["ventas-rapidas/page.tsx", "el punto de venta escribe de principio a fin"],
    ["conversaciones/[conversationId]/server/get-conversation.ts", "teléfono, nombre y el hilo entero"],
    ["pedidos/[orderId]/server/get-available-customers.ts", "nombre, correo, teléfono y documento"],
    ["boletin/server/get-newsletter-subscribers.ts", "correos de las suscriptoras"],
    ["clientes/server/get-customers.ts", "nombre y teléfono de cada clienta"],
  ])("%s exige la dueña (%s)", (relative) => {
    expect(read(path.join(ROUTES, relative))).toContain("requireStoreOwner(");
  });

  /** Pantallas abiertas a solo lectura, siempre depuradas. */
  it.each([
    ["inventario/server/get-inventory.ts", "scrubInventoryRows"],
    ["envios/server/get-shipments.ts", "scrubShipments"],
    ["preventas/server/get-presales.ts", "scrubPresales"],
    ["resenas/server/get-reviews.ts", "scrubReview"],
    ["ferias/[fairEventId]/page.tsx", "scrubFairEvent"],
    ["productos/grupo/[productGroupId]/page.tsx", "scrubProductGroup"],
  ])("%s abre la lectura pero depura (%s)", (relative, scrubber) => {
    const source = read(path.join(ROUTES, relative));
    expect(source).toContain("requireStoreRead(");
    expect(source).toContain(scrubber);
  });
});

/**
 * **Comprobación 4.** Catálogo de paridad: qué archivos pueden **consultar**
 * cada entidad que tiene depurador. Mira solo la consulta propia del archivo,
 * no lo que arrastren los ayudantes compartidos que importe: si contara la
 * ruta entera, cualquier página que importe `lib/presale.ts` aparecería como
 * si sirviera preventas. Una carga nueva que consulte la entidad y no esté
 * declarada falla, que es como se atrapa esta familia por construcción.
 */
describe("solo los archivos declarados sirven una entidad con depurador", () => {
  const all = loaders();
  const PARITY: Record<string, string[]> = {
    fairEvent: [
      "ferias/page.tsx",
      "ferias/[fairEventId]/page.tsx",
      // El filtro «feria» del kardex; el módulo entero exige la dueña.
      "movimientos-inventario/page.tsx",
    ],
    productGroup: [
      "productos/server/get-product-groups.ts",
      "productos/grupo/[productGroupId]/page.tsx",
      "productos/nuevo-grupo/page.tsx",
      "productos/page.tsx",
      // Los tres siguientes leen el grupo con `select` de id y nombre.
      "ofertas/[offerId]/server/get-offer-picker.ts",
      "productos/[productId]/server/get-product.ts",
      "productos/nombres/server/get-product-naming-candidates.ts",
    ],
    productPresale: [
      "preventas/server/get-presales.ts",
      "preventas/page.tsx",
      // La ficha del producto dice si tiene preventa abierta.
      "productos/[productId]/server/get-product.ts",
    ],
  };

  it.each(Object.entries(PARITY))("%s", (model, allowed) => {
    const pattern = new RegExp(`prismadb\\.${model}\\.`);
    const undeclared = all
      .filter((loader) => pattern.test(read(loader.files[0])))
      .map((loader) => loader.relative)
      .filter((relative) => !allowed.includes(relative));
    expect(undeclared).toEqual([]);
  });
});

/**
 * El escáner comprobándose a sí mismo: con el código de antes de cada arreglo,
 * ¿habría fallado? Sin esto, una regresión del propio escáner —volver a mirar
 * solo `prismadb.`, o volver a creerle a la prosa— pasaría desapercibida.
 */
describe("el escáner atrapa las fugas que ya ocurrieron", () => {
  const FERIAS_ANTES = `
    import { getFairEventDetail } from "@/lib/fair-events";
    export default async function FairEventPage({ params }) {
      const fairEvent = await getFairEventDetail(params.storeId, params.fairEventId);
      return <FairEventWorkspace event={{ acqPrice: fairEvent.acqPrice }} />;
    }`;
  const GRUPOS_ANTES = `
    import prismadb from "@/lib/prismadb";
    export default async function Page({ params }) {
      const group = await prismadb.productGroup.findFirst({
        where: { id: params.id },
        include: { products: { include: { images: true } } },
      });
      return <Form group={group} />;
    }`;
  const PROVEEDORES_ANTES = `
    import prismadb from "@/lib/prismadb";
    export default async function Page({ params }) {
      const suppliers = await prismadb.supplier.findMany({ where: { storeId: params.storeId } });
      return <Form suppliers={suppliers} />;
    }`;

  it("Ferias: sin guardia, sin depurar y con costo, aunque no nombre prismadb", () => {
    expect(hasGuard(FERIAS_ANTES)).toBe(false);
    expect(hasScrub(FERIAS_ANTES)).toBe(false);
    expect(sensitiveIn(FERIAS_ANTES)).toContain("acqPrice");
  });

  it("Grupos: el include sin select se ve, y el archivo no depura", () => {
    expect(wideIncludes(GRUPOS_ANTES)).toContain("products: include sin select");
    expect(hasScrub(GRUPOS_ANTES)).toBe(false);
    expect(hasGuard(GRUPOS_ANTES)).toBe(false);
  });

  it("Proveedores: la consulta sin select queda sin guardia y se marca", () => {
    expect(hasGuard(PROVEEDORES_ANTES)).toBe(false);
  });

  it("un `_count` no se confunde con traer las filas", () => {
    expect(wideIncludes("include: { _count: { select: { products: true } } }")).toEqual([]);
  });

  it("un include con select no se marca", () => {
    expect(
      wideIncludes("include: { products: { select: { product: { select: { name: true } } } } }"),
    ).toEqual([]);
  });
});
