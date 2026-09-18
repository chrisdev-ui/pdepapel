// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VariantGrid } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/variant-grid";
import type { ProductGroupFormValues } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/product-group-form";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}));
vi.mock("@/components/modals/variant-edit-modal", () => ({
  VariantEditModal: () => null,
}));

const attrs = {
  size: { id: "s1", name: "S", value: "s" },
  color: { id: "c1", name: "Rosa", value: "#f0f" },
  design: { id: "d1", name: "Kawaii" },
};

const variants: ProductGroupFormValues["variants"] = [
  { id: "p1", sku: "CAR-ROS", name: "Cartuchera Rosa", price: 13000, acqPrice: 8000, stock: 2, gtin: "7701234567897", hasNoProductIdentifier: false, isArchived: false, origin: "saved", slug: "cartuchera-rosa", ...attrs },
  { id: "p2", sku: "CAR-LIL", name: "Cartuchera Lila", price: 15000, acqPrice: 9000, stock: 3, isArchived: true, origin: "adopted", slug: "cartuchera-lila", ...attrs, color: { id: "c2", name: "Lila", value: "#c8f" } },
  { sku: "CAR-AZU", name: "Cartuchera Azul", price: 13000, acqPrice: 8000, stock: 0, origin: "new", ...attrs, color: { id: "c3", name: "Azul", value: "#08f" } },
];

let latest: ReturnType<typeof useForm<ProductGroupFormValues>> | null = null;

function Harness() {
  const form = useForm<ProductGroupFormValues>({
    defaultValues: {
      name: "Cartuchera",
      images: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/g.jpg", isMain: true }],
      categoryId: "cat",
      sizeIds: ["s1"],
      colorIds: ["c1", "c2", "c3"],
      designIds: ["d1"],
      acqPrice: 8000,
      percentageIncrease: 30,
      transportationCost: 0,
      miscCost: 0,
      price: 13000,
      variants,
      imageMapping: [],
    },
  });
  latest = form;
  return (
    <VariantGrid
      form={form}
      loading={false}
      images={[{ url: "https://res.cloudinary.com/demo/image/upload/v1/g.jpg" }]}
      imageScopes={{}}
      suppliers={[]}
      storeId="store-1"
      storeUrl="https://tienda.test"
      isEditMode
      sizes={[]}
      colors={[]}
      designs={[]}
    />
  );
}

afterEach(cleanup);

/**
 * La tabla no decía qué fila se adopta y cuál se crea, mostraba el estado
 * como «Si/No», no enlazaba a la ficha y reescribía el formulario por tecla.
 */
describe("VariantGrid", () => {
  it("shows origin and store status per row, links saved rows to their ficha and shows their URL", () => {
    render(<Harness />);

    expect(screen.getAllByText("Guardada").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Se adopta").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Se crea · 0 und").length).toBeGreaterThan(0);
    expect(screen.getAllByText("A la venta").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Archivada").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0);

    const links = screen.getAllByRole("link", { name: "Cartuchera Rosa" });
    expect(links[0]).toHaveAttribute("href", "/store-1/productos/p1");
    expect(screen.getAllByText("/producto/cartuchera-rosa").length).toBeGreaterThan(0);
    // Una variante nueva no tiene enlace ni URL todavía.
    expect(screen.queryByRole("link", { name: "Cartuchera Azul" })).toBeNull();
  });

  it("commits the GTIN on blur, not on every keystroke, and toggles archive per row", () => {
    render(<Harness />);

    const [gtin] = screen.getAllByLabelText("GTIN de Cartuchera Rosa");
    fireEvent.change(gtin, { target: { value: "7701234567880" } });
    expect(latest!.getValues("variants")![0].gtin).toBe("7701234567897");
    fireEvent.blur(gtin);
    expect(latest!.getValues("variants")![0].gtin).toBe("7701234567880");

    const [archive] = screen.getAllByRole("button", { name: "Archivar" });
    fireEvent.click(archive);
    expect(latest!.getValues("variants")![0].isArchived).toBe(true);
  });

  it("has accessible names on the icon-only actions", () => {
    render(<Harness />);
    expect(screen.getAllByRole("button", { name: "Editar Cartuchera Rosa" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Quitar Cartuchera Rosa del grupo" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("checkbox", { name: "Seleccionar Cartuchera Rosa" }).length).toBeGreaterThan(0);
  });
});
