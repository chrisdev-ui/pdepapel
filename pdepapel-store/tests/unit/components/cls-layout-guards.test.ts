import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getTrustPoints } from "@/lib/trust-points";

const source = (path: string) => readFileSync(join(__dirname, "../../..", path), "utf8");

/**
 * Arreglos de CLS que viven en clases de Tailwind y que un cambio de estilo
 * podría deshacer sin que falle ningún otro test.
 */
describe("CLS layout guards", () => {
  it("moves the whole header instead of removing the announcement bar from the flow", () => {
    const navbar = source("components/navbar.tsx");
    expect(navbar).toContain('scrolled && "max-lg:-translate-y-8"');
    expect(navbar).toContain('scrolled && "max-lg:invisible"');
    expect(navbar).not.toContain("max-lg:hidden");
    // h-8 = 32 px = lo que sube la cabecera; si la franja cambia de alto, este número también.
    expect(source("components/announcement-bar.tsx")).toContain("announcement-bar flex h-8");
  });

  it("pins the hero promises to one line from xl only while they still fit", () => {
    expect(source("components/home/hero.tsx")).toContain("xl:h-5");
    // Medido el 2026-10-05: estas tres caben en una línea de 1280 a 1920 px.
    // Si los textos crecen, quitar `xl:h-5` o volver a medir.
    const titles = getTrustPoints(250000).map((point) => point.title);
    expect(titles).toHaveLength(3);
    expect(titles.join("").length).toBeLessThanOrEqual(70);
  });
});
