import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Iniciar sesión, crear cuenta y Mi cuenta cargan Clerk completo; el resto de
 * la tienda, Clerk sin interfaz. Una navegación sin recarga hacia la cuenta
 * reutilizaría el Clerk sin interfaz y `<SignIn>` no se pintaría, así que
 * fuera de `app/(cuenta)` se entra con `StorefrontLink` (un `<a>`) o con
 * `window.location`, nunca con `next/link` ni `router.push`.
 */
const ROOT = path.resolve(__dirname, "../../..");
const ACCOUNT_TARGET =
  /accountAccessPath\(|STOREFRONT_ROUTES\.(signIn|signUp|account|myOrders|savedSearches)\b|["'`]\/(iniciar-sesion|crear-cuenta|mi-cuenta|mis-pedidos|mis-busquedas)\b/;

/** Componentes que solo se pintan dentro de la cuenta: ahí `next/link` no cruza de grupo. */
const ONLY_INSIDE_ACCOUNT = new Set([
  "components/account/account-hub.tsx",
  "components/order-history.tsx",
  "components/saved-searches.tsx",
]);

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Cada elemento `<Link …>` con sus atributos (hasta el `>` que lo cierra). */
function linkOpenings(source: string): string[] {
  const out: string[] = [];
  for (const match of Array.from(source.matchAll(/<Link\b/g))) {
    let depth = 0;
    for (let i = match.index!; i < source.length; i += 1) {
      const char = source[i];
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (char === ">" && depth === 0) {
        out.push(source.slice(match.index!, i + 1));
        break;
      }
    }
  }
  return out;
}

describe("los enlaces a la cuenta recargan la página", () => {
  const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components")), ...walk(path.join(ROOT, "hooks"))]
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
    .filter((file) => !file.startsWith("app/(cuenta)/") && !ONLY_INSIDE_ACCOUNT.has(file));

  it("encuentra los archivos de la tienda", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("ningún next/link ni router.push lleva a iniciar sesión, crear cuenta o Mi cuenta fuera de la cuenta", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      for (const opening of linkOpenings(source)) {
        if (ACCOUNT_TARGET.test(opening)) offenders.push(`${file}: ${opening.replace(/\s+/g, " ").slice(0, 120)}`);
      }
      for (const match of Array.from(source.matchAll(/router\.(push|replace)\(([^)]*)\)/g))) {
        if (ACCOUNT_TARGET.test(match[2])) offenders.push(`${file}: ${match[0].slice(0, 120)}`);
      }
    }
    expect(offenders, "Usa StorefrontLink o window.location.assign").toEqual([]);
  });

  it("los componentes permitidos siguen existiendo y solo se usan dentro de la cuenta", () => {
    const outside = files.map((file) => readFileSync(path.join(ROOT, file), "utf8"));
    for (const allowed of Array.from(ONLY_INSIDE_ACCOUNT)) {
      expect(statSync(path.join(ROOT, allowed), { throwIfNoEntry: false })?.isFile(), allowed).toBe(true);
      const name = path.basename(allowed, ".tsx");
      const importers = outside.filter((source) => source.includes(`@/components/${allowed.replace(/^components\//, "").replace(/\.tsx$/, "")}"`));
      expect(importers, `${name} se importa fuera de app/(cuenta)`).toEqual([]);
    }
  });
});
