// @vitest-environment jsdom

import { ProductNameAssistant } from "@/components/products/product-name-assistant";
import type { ProductImageAnalysis } from "@/lib/product-image-analysis";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

function createVisualAnalysis(
  overrides: Partial<ProductImageAnalysis> = {},
): ProductImageAnalysis {
  return {
    suggestedBaseName: "Cuaderno argollado A5",
    suggestedNameOptions: ["Cuaderno argollado A5"],
    suggestedDescription: null,
    brand: "Sanrio",
    categoryName: "Cuadernos",
    categoryIsDeterministic: true,
    categoryId: "category-notebooks",
    categorySource: "existing",
    sizeName: "A5",
    sizeIsDeterministic: true,
    sizeId: "size-a5",
    sizeSource: "existing",
    colorName: "Rosa",
    colorHex: "#F8B4C7",
    colorIsDeterministic: true,
    colorId: "color-rosa",
    colorSource: "existing",
    designName: null,
    designId: null,
    designSource: "not_detected",
    designIsDeterministic: false,
    gtin: null,
    mpn: null,
    variantRecommendation: {
      shouldCreateVariants: false,
      axes: [],
      evidence: null,
    },
    observations: ["La portada muestra flores."],
    limitations: [],
    ...overrides,
  };
}

function createAnalysisResponse(
  analysis: ProductImageAnalysis,
  options: { remainingAnalysesToday?: number; reusedAnalysis?: boolean } = {},
) {
  return new Response(
    JSON.stringify({
      analysis,
      remainingAnalysesToday: options.remainingAnalysesToday ?? 11,
      reusedAnalysis: options.reusedAnalysis ?? false,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("ProductNameAssistant visual analysis", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps a visual proposal review-only until the administrator loads it", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onApplyVisualAnalysis = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createAnalysisResponse(createVisualAnalysis()));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductNameAssistant
        currentName=""
        categoryName="Cuadernos"
        storeId="store-id"
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
        ]}
        onApply={onApply}
        onApplyVisualAnalysis={onApplyVisualAnalysis}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));

    expect(
      await screen.findByText("Propuesta visual para revisar"),
    ).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(onApplyVisualAnalysis).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cargar propuesta" }));

    expect(onApplyVisualAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedBaseName: "Cuaderno argollado A5",
        brand: "Sanrio",
        categoryId: "category-notebooks",
        sizeId: "size-a5",
        colorId: "color-rosa",
      }),
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(
      screen.getByDisplayValue("Cuaderno argollado A5"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/store-id/products/image-analysis",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requires confirmation before creating and selecting a newly proposed attribute", async () => {
    const user = userEvent.setup();
    const onCreateVisualAttribute = vi.fn().mockResolvedValue({
      id: "color-rosa-pastel",
      name: "Rosa pastel",
      value: "#F5B7C6",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            suggestedBaseName: "Mini impresora térmica portátil",
            brand: null,
            colorName: "Rosa pastel",
            colorHex: "#F5B7C6",
            colorId: null,
            colorSource: "new",
            designName: null,
          }),
        ),
      ),
    );

    render(
      <ProductNameAssistant
        currentName=""
        storeId="store-id"
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/impresora.webp",
        ]}
        onApply={vi.fn()}
        onApplyVisualAnalysis={vi.fn()}
        onCreateVisualAttribute={onCreateVisualAttribute}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));
    await user.click(
      await screen.findByRole("button", { name: "Crear y usar color" }),
    );

    expect(onCreateVisualAttribute).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "¿Crear color nuevo?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Crear y usar" }));

    expect(onCreateVisualAttribute).toHaveBeenCalledWith({
      type: "color",
      name: "Rosa pastel",
      colorHex: "#F5B7C6",
    });
  });

  it("lets the administrator choose a factual alternative before applying it", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            suggestedBaseName: "Mouse pad con personajes surtidos",
            suggestedNameOptions: [
              "Mouse pad con personajes surtidos",
              "Alfombrilla para mouse con personajes surtidos",
            ],
          }),
        ),
      ),
    );

    render(
      <ProductNameAssistant
        currentName=""
        storeId="store-id"
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/mouse-pad.webp",
        ]}
        onApply={vi.fn()}
        onApplyVisualAnalysis={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Elegir nombre: Alfombrilla para mouse con personajes surtidos",
      }),
    );

    expect(
      screen.getByDisplayValue(
        "Alfombrilla para mouse con personajes surtidos",
      ),
    ).toBeInTheDocument();
  });

  it("applies a description only when the administrator chooses its draft", async () => {
    const user = userEvent.setup();
    const onApplyDescription = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            suggestedDescription:
              "Cuaderno argollado con portada floral y formato A5.",
          }),
        ),
      ),
    );

    render(
      <ProductNameAssistant
        currentName=""
        storeId="store-id"
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
        ]}
        onApply={vi.fn()}
        onApplyVisualAnalysis={vi.fn()}
        onApplyDescription={onApplyDescription}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));
    expect(onApplyDescription).not.toHaveBeenCalled();

    await user.click(
      await screen.findByRole("button", {
        name: "Usar borrador de descripción",
      }),
    );

    expect(onApplyDescription).toHaveBeenCalledWith(
      "Cuaderno argollado con portada floral y formato A5.",
    );
  });

  it("requires explicit confirmation before applying a visual GTIN or MPN", async () => {
    const user = userEvent.setup();
    const onApplyVerifiedIdentifier = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            gtin: {
              value: "4006381333931",
              evidence: "Se lee bajo el código de barras del empaque.",
            },
            mpn: {
              value: "SAN-AGENDA-A5",
              evidence: "Se lee junto a la referencia del fabricante.",
            },
          }),
        ),
      ),
    );

    render(
      <ProductNameAssistant
        currentName=""
        storeId="store-id"
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
        ]}
        onApply={vi.fn()}
        onApplyVisualAnalysis={vi.fn()}
        onApplyVerifiedIdentifier={onApplyVerifiedIdentifier}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Revisar GTIN: 4006381333931",
      }),
    );

    expect(onApplyVerifiedIdentifier).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "¿Confirmas este GTIN?" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Confirmar y aplicar" }),
    );

    expect(onApplyVerifiedIdentifier).toHaveBeenCalledWith("gtin", {
      value: "4006381333931",
      evidence: "Se lee bajo el código de barras del empaque.",
    });
  });

  it("only opens the existing variant review flow after an explicit action", async () => {
    const user = userEvent.setup();
    const onReviewVariantRecommendation = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            variantRecommendation: {
              shouldCreateVariants: true,
              axes: ["COLOR", "SIZE"],
              evidence: "Se muestran colores y tamaños comprables distintos.",
            },
          }),
        ),
      ),
    );

    render(
      <ProductNameAssistant
        currentName=""
        storeId="store-id"
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
        ]}
        onApply={vi.fn()}
        onApplyVisualAnalysis={vi.fn()}
        canReviewVariantRecommendation
        onReviewVariantRecommendation={onReviewVariantRecommendation}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));
    expect(onReviewVariantRecommendation).not.toHaveBeenCalled();

    await user.click(
      await screen.findByRole("button", {
        name: "Revisar conversión a variantes",
      }),
    );

    expect(onReviewVariantRecommendation).toHaveBeenCalledOnce();
  });

  it("explains when a previous visual proposal was reused without consuming quota", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(createVisualAnalysis({ brand: null }), {
          remainingAnalysesToday: 17,
          reusedAnalysis: true,
        }),
      ),
    );

    render(
      <ProductNameAssistant
        currentName=""
        storeId="store-id"
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
        ]}
        onApply={vi.fn()}
        onApplyVisualAnalysis={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));

    expect(
      await screen.findByText(
        "Se reutilizó la propuesta de estas mismas fotos: no consumió un análisis adicional.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quedan 17 análisis visuales hoy."),
    ).toBeInTheDocument();
  });
});
