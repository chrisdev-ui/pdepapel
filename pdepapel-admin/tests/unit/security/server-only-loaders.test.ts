import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { findForbiddenKeys } from "../../helpers/forbidden-keys";

const ROOT = path.resolve(__dirname, "../../..");
const LOADERS = [
  "app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/server/get-order.ts",
  "app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
    return /\.(tsx?)$/.test(name) ? [full] : [];
  });
}

/**
 * `getOrder` y `getProductSeed` vivían en módulos `"use server"`: un import
 * de valor desde un componente de cliente los habría convertido en acciones
 * de servidor públicas (se llaman con cualquier id desde el navegador). Son
 * cargadores de página, no acciones: van con `import "server-only"`, y el
 * cliente solo puede importar sus tipos.
 */
describe("cargadores de la ficha del pedido y del producto", () => {
  it.each(LOADERS)("%s es solo de servidor y no es una acción", (file) => {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/^\s*["']use server["'];?/m);
  });

  it("ningún componente de cliente los importa como valor", () => {
    const offenders = walk(path.join(ROOT, "app"))
      .filter((file) => /^\s*["']use client["']/.test(readFileSync(file, "utf8")))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .filter((line) => /^import\s+(?!type\b)[^;]*server\/get-(order|product)["']/.test(line))
          .map((line) => `${path.relative(ROOT, file)}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
    expect(findForbiddenKeys(offenders, "viewer")).toEqual([]);
  });
});
