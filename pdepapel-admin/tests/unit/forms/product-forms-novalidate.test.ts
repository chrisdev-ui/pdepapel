import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const FORMS = [
  "app/(dashboard)/[storeId]/(routes)/productos/[productId]/components/product-form.tsx",
  "app/(dashboard)/[storeId]/(routes)/productos/components/product-group-form.tsx",
];

/** Regresión 2026-10-17: un límite nativo en la calculadora plegada frenaba «Guardar» sin avisar. */
describe("fichas de producto y de grupo", () => {
  it.each(FORMS)("%s valida con Zod (noValidate) y no con el navegador", (file) => {
    const source = readFileSync(resolve(root, file), "utf8");
    const formTag = source.match(/<form\b[^>]*>/)?.[0] ?? "";
    expect(formTag).toMatch(/\bnoValidate\b/);
  });
});
