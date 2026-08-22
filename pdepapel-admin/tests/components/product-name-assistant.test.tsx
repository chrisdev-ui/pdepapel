// @vitest-environment jsdom

import { ProductNameAssistant } from "@/components/products/product-name-assistant";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("ProductNameAssistant visual analysis", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps a visual proposal review-only until the administrator loads it", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onApplyVisualAnalysis = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          analysis: {
            suggestedBaseName: "Cuaderno argollado A5",
            brand: "Sanrio",
            colorName: "Rosa",
            colorHex: "#F8B4C7",
            colorId: "color-rosa",
            colorSource: "existing",
            colorIsDeterministic: true,
            designName: null,
            designId: null,
            designSource: "not_detected",
            designIsDeterministic: false,
            observations: ["La portada muestra flores."],
            limitations: [],
          },
          remainingAnalysesToday: 11,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          analysis: {
            suggestedBaseName: "Mini impresora térmica portátil",
            brand: null,
            colorName: "Rosa pastel",
            colorHex: "#F5B7C6",
            colorId: null,
            colorSource: "new",
            colorIsDeterministic: true,
            designName: null,
            designId: null,
            designSource: "not_detected",
            designIsDeterministic: false,
            observations: [],
            limitations: [],
          },
          remainingAnalysesToday: 11,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

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
});
