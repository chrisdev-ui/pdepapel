import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const appDir = join(__dirname, "../../../app");

const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });

/**
 * Next reemplaza el `openGraph` del layout entero (no lo mezcla): una página
 * que declara el suyo sin `images` se compartía sin foto (rastreo del
 * 2026-10-25: /marcas, las marcas, las políticas, /contacto, /tarjeta-regalo
 * y /capsulas). Toda página con `openGraph` trae su imagen.
 */
describe("og:image por plantilla", () => {
  const withOpenGraph = pages(appDir).filter((path) => readFileSync(path, "utf8").includes("openGraph"));

  it("encuentra las plantillas que se arreglaron", () => {
    const found = withOpenGraph.map((path) => relative(appDir, path));
    for (const page of [
      "(routes)/marcas/page.tsx",
      "(routes)/marcas/[slug]/page.tsx",
      "(routes)/contacto/page.tsx",
      "(routes)/tarjeta-regalo/page.tsx",
      "(routes)/capsulas/page.tsx",
      "(routes)/politicas/envios/page.tsx",
      "(routes)/politicas/devoluciones/page.tsx",
      "(routes)/politicas/privacidad/page.tsx",
      "(routes)/politicas/terminos/page.tsx",
    ]) {
      expect(found).toContain(page);
    }
  });

  it.each(withOpenGraph.map((path) => [relative(appDir, path), path]))("%s declara una imagen para compartir", (_name, path) => {
    expect(readFileSync(path, "utf8")).toMatch(/\bimages\b/);
  });
});
