// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ConvertProductWizard,
  type ProductVariantReviewPayload,
} from "@/components/modals/convert-product-to-variants-modal";
import type { ProductImageAnalysis } from "@/lib/product-image-analysis";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}));

const ids = {
  rosa: "5e1d53da-1831-4dd7-9868-1db789af4811",
  azul: "f8f250fd-03c3-4695-85e2-23e7800b3a8c",
  design: "2053d4e6-5ea3-4a73-8714-1f2ed3d1f5a1",
  size: "7f28411c-213e-4f5f-a5e4-bff4bb5d3441",
};

const product = {
  name: "Cosmetiquera Hangyodon",
  sku: "COS-HAN-AZU-U-1",
  slug: "cosmetiquera-hangyodon",
  stock: 7,
  price: 17500,
  acqPrice: 11000,
  gtin: null,
  imageUrls: ["https://example.com/azul.jpg", "https://example.com/rosa.jpg"],
  colorId: ids.azul,
  designId: ids.design,
  sizeId: ids.size,
};

const colors = [
  { id: ids.azul, name: "Azul pastel" },
  { id: ids.rosa, name: "Rosa" },
];
const designs = [{ id: ids.design, name: "Sanrio" }];
const sizes = [{ id: ids.size, name: "Único" }];

const analysis = {
  variantCandidates: [
    {
      imageIndex: 0,
      colorName: "Azul pastel",
      colorHex: "#A0C8F0",
      colorId: ids.azul,
      colorSource: "existing",
      designName: "Sanrio",
      designId: ids.design,
      designSource: "existing",
      sizeName: "Único",
      sizeId: ids.size,
      evidence: "Opción azul.",
    },
    {
      imageIndex: 1,
      colorName: "Rosa",
      colorHex: "#F0A0C8",
      colorId: ids.rosa,
      colorSource: "existing",
      designName: "Sanrio",
      designId: ids.design,
      designSource: "existing",
      sizeName: "Único",
      sizeId: ids.size,
      evidence: "Opción rosa.",
    },
  ],
} as unknown as ProductImageAnalysis;

function renderWizard(overrides: Partial<React.ComponentProps<typeof ConvertProductWizard>> = {}) {
  const onConfirm = vi.fn<(payload: ProductVariantReviewPayload) => void>();
  render(
    <ConvertProductWizard
      product={product}
      analysis={null}
      colors={colors}
      designs={designs}
      sizes={sizes}
      activeOffers={[{ id: "offer-1", name: "Hasta agotar" }]}
      isOpen
      loading={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm };
}

const units = (index: number) => screen.getByLabelText(`Unidades para la opción ${index}`);

afterEach(cleanup);

/**
 * Antes había un diálogo de un solo campo (nombre) y otro solo cuando la IA
 * veía opciones. El asistente de tres pasos reparte el stock entero, exige
 * fotos y combinaciones distintas y resume qué se conserva y qué se crea.
 */
describe("ConvertProductWizard", () => {
  it("walks name → options → summary, blocks «Revisar» until the stock is fully split, and sends the payload", () => {
    renderWizard();

    expect(screen.getByLabelText("Nombre para mostrar del grupo")).toHaveValue("Cosmetiquera Hangyodon");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    // Paso 2: el producto actual ya está como opción 1 con todo el stock.
    expect(screen.getByText("Se conserva")).toBeInTheDocument();
    expect(units(1)).toHaveDisplayValue("7");
    expect(screen.getByRole("button", { name: "Revisar" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Otra opción" }));
    expect(screen.getByText("Se crea")).toBeInTheDocument();
    // Dos fotos, dos opciones: no cabe una tercera.
    expect(screen.getByRole("button", { name: "Otra opción" })).toBeDisabled();

    fireEvent.change(units(2), { target: { value: "3" } });
    expect(screen.getByRole("status")).toHaveTextContent("Hay 3 unidades asignadas de más");
    expect(screen.getByRole("button", { name: "Revisar" })).toBeDisabled();

    fireEvent.change(units(1), { target: { value: "4" } });
    expect(screen.getByRole("status")).toHaveTextContent("Inventario repartido por completo");
    // Misma combinación en las dos opciones: tampoco pasa.
    expect(screen.getByRole("status")).toHaveTextContent("misma combinación");
    expect(screen.getByRole("button", { name: "Revisar" })).toBeDisabled();
  });

  it("prefills the options the AI saw, shows the offer choice in the summary and confirms with copyOffers", () => {
    const { onConfirm } = renderWizard({ analysis });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("La foto muestra: Opción rosa.")).toBeInTheDocument();
    fireEvent.change(units(1), { target: { value: "4" } });
    fireEvent.change(units(2), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));

    expect(screen.getByText(/Antes de crear el grupo/)).toBeInTheDocument();
    expect(screen.getByText(/movimiento «Conversión a variantes»/)).toBeInTheDocument();
    expect(screen.getByText(/sigue abriendo el producto actual/)).toBeInTheDocument();
    const copy = screen.getByRole("checkbox", { name: "Copiar las ofertas vigentes a las opciones nuevas" });
    expect(copy).toBeChecked();
    fireEvent.click(copy);

    fireEvent.click(screen.getByRole("button", { name: "Crear grupo" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toEqual({
      name: "Cosmetiquera Hangyodon",
      copyOffers: false,
      variants: [
        expect.objectContaining({ imageUrl: product.imageUrls[0], keepExistingProduct: true, stock: 4, color: { mode: "existing", id: ids.azul } }),
        expect.objectContaining({ imageUrl: product.imageUrls[1], keepExistingProduct: false, stock: 3, color: { mode: "existing", id: ids.rosa } }),
      ],
    });
  });

  /** En producción el asistente volvía al paso 1 al pulsar «Crear grupo»: el padre re-renderizaba con un objeto `product` nuevo. */
  it("keeps its step when the parent re-renders with an equal product object", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConvertProductWizard product={{ ...product }} analysis={null} colors={colors} designs={designs} sizes={sizes} activeOffers={[]} isOpen loading={false} onClose={vi.fn()} onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Otra opción" }));
    rerender(
      <ConvertProductWizard product={{ ...product }} analysis={null} colors={colors} designs={designs} sizes={sizes} activeOffers={[]} isOpen loading onClose={vi.fn()} onConfirm={onConfirm} />,
    );
    expect(screen.getByText("Se crea")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre para mostrar del grupo")).toBeNull();
  });

  it("lets the group be created with the current product alone", () => {
    const { onConfirm } = renderWizard({ activeOffers: [] });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Crear grupo" }));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ copyOffers: false, variants: [{ keepExistingProduct: true, stock: 7 }] });
  });
});
