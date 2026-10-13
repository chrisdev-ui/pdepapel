import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda purga de la tienda dice qué productos tocó. Una llamada sin alcance
 * borra la caché de las ~900 fichas, el inicio, /tienda y cada categoría, y
 * el siguiente visitante de cada página espera un render completo. Las
 * excepciones son los cambios que de verdad tocan todo el catálogo, una por
 * una con su motivo y la cantidad exacta de llamadas sin alcance del archivo.
 */
const ROOT = path.resolve(__dirname, "../../..");

const FULL_PURGE_ALLOWED: Record<string, { calls: number; reason: string }> = {
  "app/api/[storeId]/designs/route.ts": { calls: 2, reason: "un diseño nuevo o renombrado cambia filtros y fichas de todo el catálogo" },
  "app/api/[storeId]/designs/[designId]/route.ts": { calls: 2, reason: "renombrar o borrar un diseño toca todas las fichas que lo usan" },
  "app/api/[storeId]/sizes/route.ts": { calls: 2, reason: "tallas: atributo del catálogo" },
  "app/api/[storeId]/sizes/[sizeId]/route.ts": { calls: 2, reason: "tallas: atributo del catálogo" },
  "app/api/[storeId]/colors/route.ts": { calls: 2, reason: "colores: atributo del catálogo y muestra en cada ficha" },
  "app/api/[storeId]/colors/[colorId]/route.ts": { calls: 2, reason: "colores: atributo del catálogo y muestra en cada ficha" },
  "app/api/[storeId]/attributes/move/route.ts": { calls: 2, reason: "mover valores de atributo entre categorías" },
  "app/api/[storeId]/attributes/merge/route.ts": { calls: 2, reason: "fusionar valores de atributo" },
  "app/api/[storeId]/attributes/archive/route.ts": { calls: 1, reason: "archivar valores de atributo" },
  "app/api/[storeId]/categories/route.ts": { calls: 4, reason: "crear o borrar categorías cambia el árbol del encabezado (todas las páginas)" },
  "app/api/[storeId]/categories/[categoryId]/route.ts": { calls: 4, reason: "renombrar o mover una categoría cambia el árbol del encabezado" },
  "app/api/[storeId]/categories/[categoryId]/cover/route.ts": { calls: 1, reason: "la portada de la categoría sale en el encabezado" },
  "app/api/[storeId]/types/route.ts": { calls: 2, reason: "tipos: árbol del encabezado" },
  "app/api/[storeId]/types/[typeId]/route.ts": { calls: 2, reason: "tipos: árbol del encabezado" },
  "app/api/[storeId]/catalog-migration/route.ts": { calls: 1, reason: "migración del catálogo completo" },
  "app/api/stores/[storeId]/route.ts": { calls: 1, reason: "ajustes de la tienda (envío gratis, contacto) salen en todas las páginas" },
  "lib/category-covers.ts": { calls: 1, reason: "portadas de categoría: encabezado" },
};

/** Las purgas internas: las caídas a la purga completa y las promociones. */
const IMPLEMENTATION_FILES = new Set(["lib/cache.ts", "lib/revalidate-store.ts"]);

const PURGE_CALL = /\b(invalidateStoreProductsCache|triggerStorefrontRevalidation)\(/g;

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** El texto de los argumentos de la llamada que empieza en `open` (el paréntesis). */
function callArguments(source: string, open: number): string {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    if (char === ")" || char === "}" || char === "]") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  return source.slice(open + 1);
}

function hasTopLevelComma(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === "(" || char === "{" || char === "[") depth += 1;
    if (char === ")" || char === "}" || char === "]") depth -= 1;
    if (char === "," && depth === 0) return true;
  }
  return false;
}

const homeContentScoped = /HOME_CONTENT_REVALIDATION\s*=\s*\{\s*scope:/.test(readFileSync(path.join(ROOT, "lib/home-content.ts"), "utf8"));

function isScoped(fn: string, args: string): boolean {
  if (fn === "invalidateStoreProductsCache") return hasTopLevelComma(args.trim().replace(/,\s*$/, ""));
  return /\bscope\b/.test(args) || (args.trim() === "HOME_CONTENT_REVALIDATION" && homeContentScoped);
}

function unscopedCalls(): Map<string, number> {
  const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))].filter((file) => /\.(ts|tsx)$/.test(file));
  const found = new Map<string, number>();
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    if (IMPLEMENTATION_FILES.has(relative)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of Array.from(source.matchAll(PURGE_CALL))) {
      const before = source.slice(Math.max(0, match.index! - 40), match.index);
      if (/function\s+$/.test(before) || /import[^;]*$/.test(before)) continue;
      const args = callArguments(source, match.index! + match[0].length - 1);
      if (!isScoped(match[1], args)) found.set(relative, (found.get(relative) ?? 0) + 1);
    }
  }
  return found;
}

describe("cada purga de la tienda dice qué productos tocó", () => {
  const found = unscopedCalls();

  it("ninguna purga completa fuera de la lista de excepciones", () => {
    const unexpected = Array.from(found.entries())
      .filter(([file, count]) => !FULL_PURGE_ALLOWED[file] || count > FULL_PURGE_ALLOWED[file].calls)
      .map(([file, count]) => `${file}: ${count} sin alcance`);
    expect(unexpected, "Pasa los productos o pedidos que cambiaron (o agrégala aquí con su motivo)").toEqual([]);
  });

  it("cada excepción sigue existiendo con exactamente esas llamadas", () => {
    const stale = Object.entries(FULL_PURGE_ALLOWED)
      .filter(([file, { calls }]) => (found.get(file) ?? 0) !== calls)
      .map(([file, { calls }]) => `${file}: esperaba ${calls}, hay ${found.get(file) ?? 0}`);
    expect(stale, "Actualiza la lista: una excepción ya no aplica o cambió").toEqual([]);
  });

  it("el inicio purga solo su contenido", () => {
    expect(homeContentScoped).toBe(true);
  });
});
