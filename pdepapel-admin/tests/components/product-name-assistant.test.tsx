// @vitest-environment jsdom

import { ProductNameAssistant } from "@/components/products/product-name-assistant";
import type { ProductImageAnalysis } from "@/lib/product-image-analysis";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { value: () => false, configurable: true },
    releasePointerCapture: { value: () => undefined, configurable: true },
    setPointerCapture: { value: () => undefined, configurable: true },
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => undefined,
    configurable: true,
  });
});

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
    variantCandidates: [],
    catalogAttributes: [],
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

  it("shows one review workspace and applies only the selected proposal fields", async () => {
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
      await screen.findByRole("heading", { name: "Revisa la propuesta de IA" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Cuaderno argollado A5/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Marca o fabricante" }),
    ).toBeChecked();
    expect(
      screen.queryByRole("button", { name: "Cargar propuesta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Usar sugerencia" }),
    ).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(onApplyVisualAnalysis).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "Aplicar 5 campos seleccionados",
      }),
    );

    expect(onApply).toHaveBeenCalledWith("Cuaderno argollado A5 Sanrio");
    expect(onApplyVisualAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedBaseName: "Cuaderno argollado A5",
        brand: "Sanrio",
        categoryId: "category-notebooks",
        sizeId: "size-a5",
        colorId: "color-rosa",
      }),
    );
    expect(
      screen.getByDisplayValue("Cuaderno argollado A5"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "5 campos aplicados al formulario. Aún debes guardar el producto.",
      ),
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
      await screen.findByRole("button", {
        name: "Crear color y aprobarlo",
      }),
    );

    expect(onCreateVisualAttribute).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "¿Crear color nuevo?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Crear y aprobar" }));

    expect(onCreateVisualAttribute).toHaveBeenCalledWith({
      type: "color",
      name: "Rosa pastel",
      colorHex: "#F5B7C6",
    });
  });

  it("lets the administrator reuse a close existing taxonomy option", async () => {
    const user = userEvent.setup();
    const onApplyVisualAnalysis = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            brand: null,
            categoryName: "Troquel",
            categoryId: null,
            categorySource: "not_detected",
            categoryAlternatives: [
              {
                id: "category-dies",
                name: "Troqueles",
                typeName: "Journal / Scrap",
              },
            ],
            sizeName: null,
            sizeId: null,
            sizeSource: "not_detected",
            colorName: null,
            colorId: null,
            colorSource: "not_detected",
          }),
        ),
      ),
    );

    render(
      <ProductNameAssistant
        currentName=""
        storeId="store-id"
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/troquel.webp",
        ]}
        onApply={vi.fn()}
        onApplyVisualAnalysis={onApplyVisualAnalysis}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Usar Troqueles · Journal / Scrap",
      }),
    );

    expect(
      screen.getByRole("checkbox", { name: "Subcategoría" }),
    ).toBeChecked();
    await user.click(
      screen.getByRole("button", {
        name: "Aplicar 2 campos seleccionados",
      }),
    );
    expect(onApplyVisualAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: "category-dies",
        categoryName: "Troqueles",
        categorySource: "existing",
      }),
    );
  });

  it("requires a parent type before creating a proposed subcategory", async () => {
    const user = userEvent.setup();
    const onCreateSuggestedCategory = vi.fn().mockResolvedValue({
      id: "category-dies",
      name: "Troqueles",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            brand: null,
            categoryName: "Troqueles",
            categoryId: null,
            categorySource: "not_detected",
            categoryAlternatives: [],
            sizeName: null,
            sizeId: null,
            sizeSource: "not_detected",
            colorName: null,
            colorId: null,
            colorSource: "not_detected",
          }),
        ),
      ),
    );

    render(
      <ProductNameAssistant
        currentName=""
        storeId="store-id"
        imageUrls={[
          "https://res.cloudinary.com/pdepapel/image/upload/v1/troquel.webp",
        ]}
        categoryTypes={[{ id: "type-scrap", name: "Journal / Scrap" }]}
        onApply={vi.fn()}
        onApplyVisualAnalysis={vi.fn()}
        onCreateSuggestedCategory={onCreateSuggestedCategory}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Crear subcategoría y aprobarla",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Crear y aprobar" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "Tipo padre" }));
    await user.click(
      await screen.findByRole("option", { name: "Journal / Scrap" }),
    );
    await user.click(screen.getByRole("button", { name: "Crear y aprobar" }));

    expect(onCreateSuggestedCategory).toHaveBeenCalledWith({
      name: "Troqueles",
      typeId: "type-scrap",
    });
  });

  it("requires explicit logistics choices before creating an internal size", async () => {
    const user = userEvent.setup();
    const onCreateSuggestedSize = vi.fn().mockResolvedValue({
      id: "size-small-light",
      name: "Pequeño liviano",
      value: "S-L",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            brand: null,
            categoryName: null,
            categoryId: null,
            categorySource: "not_detected",
            sizeName: "A5",
            sizeId: null,
            sizeSource: "not_detected",
            sizeAlternatives: [],
            colorName: null,
            colorId: null,
            colorSource: "not_detected",
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
        onCreateSuggestedSize={onCreateSuggestedSize}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Crear tamaño interno y aprobarlo",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Crear y aprobar" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("combobox", { name: "Dimensión" }));
    await user.click(await screen.findByRole("option", { name: "Pequeño" }));
    await user.click(screen.getByRole("combobox", { name: "Peso" }));
    await user.click(await screen.findByRole("option", { name: "Liviano" }));
    await user.click(screen.getByRole("button", { name: "Crear y aprobar" }));

    expect(onCreateSuggestedSize).toHaveBeenCalledWith({
      dimension: "S",
      weight: "L",
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
      await screen.findByRole("radio", {
        name: "Alfombrilla para mouse con personajes surtidos",
      }),
    );

    expect(
      screen.getByDisplayValue(
        "Alfombrilla para mouse con personajes surtidos",
      ),
    ).toBeInTheDocument();
  });

  it("previews and applies a selected rich-text description", async () => {
    const user = userEvent.setup();
    const onApplyDescription = vi.fn();
    const suggestedDescription =
      "<p>Cuaderno <strong>argollado</strong> con portada floral.</p><h3>Detalles visibles</h3><ul><li>Formato A5</li></ul>";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            suggestedDescription,
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
    expect(await screen.findByText("Detalles visibles")).toBeInTheDocument();
    expect(screen.getByText("Formato A5")).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", {
        name: "Aplicar 6 campos seleccionados",
      }),
    );

    expect(onApplyDescription).toHaveBeenCalledWith(suggestedDescription);
  });

  it("lets the administrator approve customer-visible features independently", async () => {
    const user = userEvent.setup();
    const onApplyVisualAnalysis = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createAnalysisResponse(
          createVisualAnalysis({
            brand: null,
            categoryName: null,
            categoryIsDeterministic: false,
            categoryId: null,
            categorySource: "not_detected",
            sizeName: null,
            sizeIsDeterministic: false,
            sizeId: null,
            sizeSource: "not_detected",
            colorName: null,
            colorHex: null,
            colorIsDeterministic: false,
            colorId: null,
            colorSource: "not_detected",
            catalogAttributes: [
              {
                key: "formato",
                name: "Formato",
                value: "A5",
                evidence: "El empaque indica A5.",
              },
              {
                key: "cantidad",
                name: "Cantidad",
                value: "12 hojas",
                evidence: "La etiqueta indica 12 hojas.",
              },
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
          "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
        ]}
        onApply={vi.fn()}
        onApplyVisualAnalysis={onApplyVisualAnalysis}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar fotos" }));
    const quantityFeature = await screen.findByRole("checkbox", {
      name: /Cantidad: 12 hojas/,
    });
    expect(screen.getByRole("checkbox", { name: /Formato: A5/ })).toBeChecked();
    expect(quantityFeature).toBeChecked();

    await user.click(quantityFeature);
    await user.click(
      screen.getByRole("button", {
        name: "Aplicar 2 campos seleccionados",
      }),
    );

    expect(onApplyVisualAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogAttributes: [
          expect.objectContaining({ key: "formato", value: "A5" }),
        ],
      }),
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
            variantCandidates: [
              {
                imageIndex: 0,
                colorName: "Rosa",
                colorHex: "#F8B4C7",
                colorId: "color-rosa",
                colorSource: "existing",
                designName: null,
                designId: null,
                designSource: "not_detected",
                sizeName: "A5",
                sizeId: "size-a5",
                evidence: "Primera opción rosa.",
              },
              {
                imageIndex: 1,
                colorName: "Azul",
                colorHex: "#4F8EF7",
                colorId: null,
                colorSource: "new",
                designName: null,
                designId: null,
                designSource: "not_detected",
                sizeName: "A5",
                sizeId: "size-a5",
                evidence: "Segunda opción azul.",
              },
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
          "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
          "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno-azul.webp",
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
        name: "Revisar 2 opciones",
      }),
    );

    expect(onReviewVariantRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ variantCandidates: expect.any(Array) }),
    );
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
