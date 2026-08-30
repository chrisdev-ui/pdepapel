// @vitest-environment jsdom

import { ReviewProductVariantsModal } from "@/components/modals/review-product-variants-modal";
import type { ProductImageAnalysis } from "@/lib/product-image-analysis";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}));

const identifiers = {
  red: "5e1d53da-1831-4dd7-9868-1db789af4811",
  blue: "f8f250fd-03c3-4695-85e2-23e7800b3a8c",
  design: "2053d4e6-5ea3-4a73-8714-1f2ed3d1f5a1",
  size: "7f28411c-213e-4f5f-a5e4-bff4bb5d3441",
};

const analysis: ProductImageAnalysis = {
  suggestedBaseName: null,
  suggestedNameOptions: [],
  suggestedDescription: null,
  brand: null,
  categoryName: null,
  categoryIsDeterministic: false,
  sizeName: null,
  sizeIsDeterministic: false,
  colorName: null,
  colorHex: null,
  colorIsDeterministic: false,
  designName: null,
  designIsDeterministic: false,
  gtin: null,
  mpn: null,
  variantRecommendation: {
    shouldCreateVariants: true,
    axes: ["COLOR"],
    evidence: "Dos colores visibles.",
  },
  variantCandidates: [
    {
      imageIndex: 0,
      colorName: "Rojo",
      colorHex: "#FF0000",
      colorId: identifiers.red,
      colorSource: "existing",
      designName: "Clásico",
      designId: identifiers.design,
      designSource: "existing",
      sizeName: "Único",
      sizeId: identifiers.size,
      evidence: "Opción roja.",
    },
    {
      imageIndex: 1,
      colorName: "Azul",
      colorHex: "#0000FF",
      colorId: identifiers.blue,
      colorSource: "existing",
      designName: "Clásico",
      designId: identifiers.design,
      designSource: "existing",
      sizeName: "Único",
      sizeId: identifiers.size,
      evidence: "Opción azul.",
    },
  ],
  catalogAttributes: [],
  observations: [],
  limitations: [],
  categoryId: null,
  categorySource: "not_detected",
  sizeId: null,
  sizeSource: "not_detected",
  colorId: null,
  colorSource: "not_detected",
  designId: null,
  designSource: "not_detected",
};

describe("ReviewProductVariantsModal", () => {
  afterEach(cleanup);

  it("requires an exact inventory allocation before submitting reviewable variants", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ReviewProductVariantsModal
        analysis={analysis}
        colors={[
          { id: identifiers.red, name: "Rojo", value: "#FF0000" },
          { id: identifiers.blue, name: "Azul", value: "#0000FF" },
        ]}
        designs={[{ id: identifiers.design, name: "Clásico" }]}
        sizes={[{ id: identifiers.size, name: "Único", value: "Único" }]}
        defaultName="Mouse pad"
        defaultVariant={{
          colorId: identifiers.red,
          designId: identifiers.design,
          sizeId: identifiers.size,
          stock: 5,
        }}
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/red.jpg",
          "https://res.cloudinary.com/pdepapel/image/upload/v1/blue.jpg",
        ]}
        isOpen
        loading={false}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const createButton = screen.getByRole("button", {
      name: "Crear variantes revisadas",
    });
    expect(createButton).toBeDisabled();

    const firstQuantity = screen.getByRole("spinbutton", {
      name: "Unidades para opción 1",
    });
    const secondQuantity = screen.getByRole("spinbutton", {
      name: "Unidades para opción 2",
    });
    await user.clear(firstQuantity);
    await user.type(firstQuantity, "3");
    await user.clear(secondQuantity);
    await user.type(secondQuantity, "2");

    expect(createButton).toBeEnabled();
    await user.click(createButton);

    expect(onConfirm).toHaveBeenCalledWith({
      name: "Mouse pad",
      variants: [
        {
          imageUrl:
            "https://res.cloudinary.com/pdepapel/image/upload/v1/red.jpg",
          keepExistingProduct: true,
          stock: 3,
          color: { mode: "existing", id: identifiers.red },
          design: { mode: "existing", id: identifiers.design },
          sizeId: identifiers.size,
        },
        {
          imageUrl:
            "https://res.cloudinary.com/pdepapel/image/upload/v1/blue.jpg",
          keepExistingProduct: false,
          stock: 2,
          color: { mode: "existing", id: identifiers.blue },
          design: { mode: "existing", id: identifiers.design },
          sizeId: identifiers.size,
        },
      ],
    });
  });
});
