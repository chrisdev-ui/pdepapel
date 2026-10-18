// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { BrandFromGroup, BrandSuggestion, type BrandOption } from "@/components/brands/brand-picker";

const brand = (id: string, name: string, aliases: string[] = []): BrandOption => ({
  id,
  name,
  aliases,
  logoUrl: null,
  logoPermission: "UNKNOWN",
  isArchived: false,
});

const brands = [brand("b-kiut", "Kiut"), brand("b-scribe", "Scribe", ["Incolors"]), brand("b-norma", "Norma")];

afterEach(cleanup);

describe("BrandSuggestion", () => {
  it("suggests the one brand the product name mentions and uses it only on «Usar»", () => {
    const onUse = vi.fn();
    render(<BrandSuggestion productName="Cuaderno argollado Kiut 80 hojas" brands={brands} value={null} onUse={onUse} />);

    expect(screen.getByRole("status").textContent).toContain("¿Es de la marca Kiut?");
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usar Kiut" }));
    expect(onUse).toHaveBeenCalledWith("b-kiut");
  });

  it("says when the match comes from an alias", () => {
    render(<BrandSuggestion productName="Colores Incolors doble punta" brands={brands} value={null} onUse={vi.fn()} />);

    expect(screen.getByRole("status").textContent).toContain("por el alias «Incolors»");
    expect(screen.getByRole("button", { name: "Usar Scribe" })).toBeTruthy();
  });

  it("stays quiet when the field already has a brand or the name mentions two", () => {
    render(<BrandSuggestion productName="Cuaderno Kiut" brands={brands} value="b-norma" onUse={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    render(<BrandSuggestion productName="Kit Kiut y Norma" brands={brands} value={null} onUse={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the AI brand as a suggestion and never offers to use a brand the store does not have", () => {
    const onUse = vi.fn();
    render(
      <BrandSuggestion
        productName="Cuaderno"
        brands={brands}
        value={null}
        aiSuggestion={{ brandId: "b-norma", brandName: "Norma", brandSource: "existing" }}
        onUse={onUse}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar" }));
    expect(onUse).toHaveBeenCalledWith("b-norma");
    cleanup();

    render(
      <BrandSuggestion
        productName="Cuaderno"
        brands={brands}
        value={null}
        aiSuggestion={{ brandId: null, brandName: "Stabilo", brandSource: "not_found" }}
        onUse={vi.fn()}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("no está en tus marcas");
    expect(screen.queryByRole("button", { name: /Usar/ })).toBeNull();
  });
});

describe("BrandFromGroup", () => {
  it("shows a variant's brand read-only, as coming from its group", () => {
    render(<BrandFromGroup brand={{ name: "Kiut", logoUrl: null }} />);
    expect(screen.getByText(/Kiut/).textContent).toContain("viene del grupo");
  });
});
