import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { isExcludedSection, SECTION_MENU_EXCLUDED } from "@/lib/whatsapp/section-menu";

describe("secciones que no van en el menú", () => {
  it("la lista de exclusiones está en un solo sitio", () => {
    expect(SECTION_MENU_EXCLUDED).toEqual(["empaque", "sobre", "foami", "bolsa"]);
  });

  it.each(["Empaques para regalo", "Sobres", "Sobre de manila", "🎁 Bolsas de regalo", "Foami", "Foamis escarchados", "Bolsitas"])(
    "«%s» queda fuera",
    (name) => expect(isExcludedSection(name)).toBe(true),
  );

  it.each(["Cuadernos", "Marcadores", "Bolsos pequeños", "Kits para regalar o regalarse", "Sobrecubiertas", "Agendas"])(
    "«%s» sí entra",
    (name) => expect(isExcludedSection(name)).toBe(false),
  );
});
