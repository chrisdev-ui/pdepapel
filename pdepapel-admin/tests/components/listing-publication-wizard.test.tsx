// @vitest-environment jsdom

import { ListingPublicationWizard } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listing-publication-wizard";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom no descarga imágenes: cada foto mide 1200 × 1200, salvo las que una prueba pida.
const pictureMocks = vi.hoisted(() => ({ sizes: {} as Record<string, { width: number; height: number } | "error"> }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/use-picture-checks", () => ({
  usePictureChecks: (urls: readonly string[]) =>
    Object.fromEntries(urls.map((url) => [url, pictureMocks.sizes[url] ?? { width: 1200, height: 1200 }])),
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: () => <button type="button">Producto local</button>,
}));
const scanMocks = vi.hoisted(() => ({
  scanned: { id: "product-scan", name: "Termo Owala", sku: "TER-OWA-01", stock: 4, price: 52000, images: [] },
}));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label }: { onFound: (product: unknown) => void; label?: string }) => (
    <button type="button" onClick={() => onFound(scanMocks.scanned)}>
      {label ?? "Escanear"}
    </button>
  ),
}));

const product = {
  id: "product-1",
  name: "Lapicero kawaii",
  sku: "LAP-KAW-01",
  stock: 8,
  acqPrice: 7000,
  transportationCost: null,
  price: 12000,
  category: { id: "category-1", name: "Lapiceros" },
  images: [{ url: "https://example.com/lapicero.jpg" }],
};

function WizardHarness({
  onPublish,
  onSuggestPrice = async () => undefined,
  onApplyActiveConditions = async () => undefined,
  onLoadPriceEstimate = async () => true,
  onPersistStep,
  activePublication = false,
  error = null,
  familyName = "Lapicero kawaii",
  hasNoProductIdentifier = false,
  initialStep,
  initialIssue,
  suggestions = [],
  suggestionsNotice = null,
  withColorList = false,
  onProductChange = () => undefined,
  extraAttributes = [],
  isKit = false,
  images = product.images,
  onSearchCategories = async () => undefined,
  validation,
  onValidate,
  initialPrice = "24000",
  noCost = false,
}: {
  noCost?: boolean;
  initialPrice?: string;
  extraAttributes?: { id: string; name: string; required: boolean; conditionalRequired?: boolean; catalogRequired?: boolean; valueType: string; values: { id: string; name: string }[] }[];
  isKit?: boolean;
  images?: { url: string }[];
  onSearchCategories?: (query?: string) => Promise<void>;
  validation?: {
    ok: boolean;
    current: boolean;
    errors: { step: "producto" | "categoria" | "ficha" | "precio" | null; field: string | null; message: string }[];
    warnings: { field: string | null; message: string }[];
  } | null;
  onValidate?: () => Promise<void>;
  onPublish: () => Promise<void>;
  onProductChange?: (productId: string, product?: unknown) => void;
  onSuggestPrice?: () => Promise<void>;
  onApplyActiveConditions?: () => Promise<void>;
  onLoadPriceEstimate?: () => Promise<boolean>;
  onPersistStep?: (step: 1 | 2 | 3 | 4) => Promise<boolean>;
  activePublication?: boolean;
  error?: string | null;
  familyName?: string;
  hasNoProductIdentifier?: boolean;
  initialStep?: 1 | 2 | 3 | 4;
  initialIssue?: { field: "attribute:BRAND" | "familyName"; message: string } | null;
  suggestions?: {
    categoryId: string;
    categoryName: string;
    domainId: string | null;
    domainName: string | null;
    path: string[];
  }[];
  suggestionsNotice?: string | null;
  withColorList?: boolean;
}) {
  const [form, setForm] = useState({
    productId: product.id,
    familyName,
    marketplacePrice: initialPrice,
    categoryId: "MCO123",
    listingType: "gold_special",
    stockSafetyBuffer: "0",
    minimumMarginAmount: "12000",
    syncPrice: true,
    imageUrls: images.map((image) => image.url),
    attributes: "",
    freeShipping: false,
    localPickUp: false,
    packageHeightCm: "",
    packageWidthCm: "",
    packageLengthCm: "",
    packageWeightGrams: "",
    belowCostReason: "",
  });

  const priceEstimate = {
    saleFeeAmount: 4560,
    percentageFee: 19,
    fixedFee: 0,
    financingAddOnFee: 0,
    listingFeeAmount: 0,
    listingTypeId: "gold_special",
    listingTypeName: "Clásica",
    listingExposure: "highest",
    installmentCount: 3,
    installmentLabel: "Hasta 3 cuotas con 0% interés",
  };
  const premiumPriceEstimate = {
    ...priceEstimate,
    saleFeeAmount: 6120,
    financingAddOnFee: 1560,
    listingTypeId: "gold_pro",
    listingTypeName: "Premium",
    installmentCount: 6,
    installmentLabel: "Hasta 6 cuotas con 0% interés",
  };
  const activeSaleConditions = activePublication
    ? {
        current: {
          listingType: "gold_special",
          categoryId: "MCO123",
          price: 24000,
          shippingMode: "me2",
          logisticType: "drop_off",
          freeShipping: false,
          localPickUp: false,
          mandatoryFreeShipping: false,
        },
        availableListingTypes: ["gold_special", "gold_pro"],
        options: [priceEstimate, premiumPriceEstimate],
      }
    : null;

  return (
    <ListingPublicationWizard
      storeId="store-1"
      editing={activePublication}
      initialStep={initialStep}
      initialIssue={initialIssue}
      onPersistStep={onPersistStep}
      activePublication={activePublication}
      activeSaleConditions={activeSaleConditions}
      canPublishDirectly={!activePublication}
      form={form}
      setForm={setForm}
      error={error}
      selectedProduct={{ ...product, ...(noCost ? { acqPrice: null } : {}), images, hasNoProductIdentifier, isKit }}
      suggestions={suggestions}
      suggestionsNotice={suggestionsNotice}
      categoryAttributes={[
        {
          id: "BRAND",
          name: "Marca",
          required: true,
          valueType: "string",
          values: [],
        },
        ...(withColorList
          ? [
              {
                id: "COLOR",
                name: "Color",
                required: true,
                valueType: "string",
                values: [
                  { id: "1", name: "Rosado" },
                  { id: "2", name: "Azul" },
                ],
              },
            ]
          : []),
        ...(hasNoProductIdentifier
          ? [
              {
                id: "GTIN",
                name: "Código universal de producto",
                required: true,
                valueType: "string",
                values: [],
              },
            ]
          : []),
        ...extraAttributes,
      ]}
      verifiedCategoryId="MCO123"
      categoryTemplates={[]}
      quickProfile={{
        id: "profile-1",
        name: "Lapiceros · Mercado Libre",
        categoryId: "MCO123",
        stockSafetyBuffer: 0,
        minimumMarginAmount: 12000,
        localCategory: product.category,
      }}
      priceEstimate={priceEstimate}
      priceOptions={[priceEstimate, premiumPriceEstimate]}
      shippingComparison={
        activePublication
          ? {
              buyerPays: {
                sellerCost: 0,
                currencyId: "COP",
                billableWeightGrams: 500,
                discountRate: null,
                promotedAmount: null,
              },
              sellerOffersFree: {
                sellerCost: 15200,
                currencyId: "COP",
                billableWeightGrams: 500,
                discountRate: 0.5,
                promotedAmount: 30400,
              },
              currentFreeShipping: false,
              mandatoryFreeShipping: false,
              logisticType: "drop_off",
            }
          : null
      }
      isSearchingCategories={false}
      isLoadingCategoryAttributes={false}
      isLoadingPriceEstimate={false}
      isLoadingShippingComparison={false}
      isLoadingSaleConditions={false}
      isApplyingSaleConditions={false}
      isSuggestingPrice={false}
      isSaving={false}
      isSavingTemplate={false}
      isSavingQuickProfile={false}
      onFormChange={(key, value) =>
        setForm((current) => ({ ...current, [key]: value }))
      }
      onProductChange={onProductChange}
      onSearchCategories={onSearchCategories}
      validation={validation}
      onValidate={onValidate}
      onCategoryChange={(categoryId) =>
        setForm((current) => ({ ...current, categoryId }))
      }
      onLoadCategoryAttributes={async () => true}
      onLoadPriceEstimate={onLoadPriceEstimate}
      onLoadShippingComparison={async () => undefined}
      onApplyActiveSaleConditions={onApplyActiveConditions}
      onListingTypeChange={(listingType) =>
        setForm((current) => ({ ...current, listingType }))
      }
      onSuggestPriceFromTarget={onSuggestPrice}
      onApplyCategoryTemplate={() => undefined}
      onSaveCategoryTemplate={async () => undefined}
      onSaveQuickProfile={async () => undefined}
      onSave={async () => undefined}
      onSaveAndPublish={onPublish}
    />
  );
}

describe("ListingPublicationWizard", () => {
  afterEach(() => {
    cleanup();
  });

  it("guides an administrator from product details to direct publishing", async () => {
    const onPublish = vi.fn(async () => undefined);
    render(<WizardHarness onPublish={onPublish} />);

    expect(
      screen.queryByText(/videos de la publicación/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Perfil rápido aplicado/i)).toBeVisible();
    expect(
      screen.getByRole("spinbutton", { name: "Unidades de seguridad" }),
    ).toHaveValue("0");
    expect(screen.getByText(/Precio de la tienda en línea:/)).toBeVisible();
    expect(
      screen.getByLabelText(/Nombre de familia en Mercado Libre/),
    ).toHaveValue("Lapicero kawaii");

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByLabelText(/^Categoría de Mercado Libre/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByLabelText(/Marca/)).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Marca/), {
      target: { value: "P de Papel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findAllByText("Lapicero kawaii")).toHaveLength(2);
    expect(screen.getByText("Precio de la tienda en línea")).toBeVisible();
    expect(screen.getByText("Condiciones de venta")).toBeVisible();
    expect(
      screen.getByText("Hasta 3 cuotas con 0% interés"),
    ).toBeVisible();
    expect(
      screen.getByText("Hasta 6 cuotas con 0% interés"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Publicar ahora" }));

    expect(onPublish).toHaveBeenCalledOnce();
  });

  it("keeps the store price as a reference and calculates only the Mercado Libre price", async () => {
    const onPublish = vi.fn(async () => undefined);
    const onSuggestPrice = vi.fn(async () => undefined);
    render(
      <WizardHarness onPublish={onPublish} onSuggestPrice={onSuggestPrice} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByLabelText(/^Categoría de Mercado Libre/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.change(await screen.findByLabelText(/Marca/), {
      target: { value: "P de Papel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText("Precio de venta en Mercado Libre"),
    ).toBeVisible();
    expect(screen.getByText(/Diferencia frente a tienda:/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sugerir precio de Mercado Libre",
      }),
    );

    expect(onSuggestPrice).toHaveBeenCalledOnce();
  });

  it("shows category recovery errors inside the publication modal", () => {
    render(
      <WizardHarness
        onPublish={async () => undefined}
        error="La categoría ya no está disponible. Elige una opción verificada."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "La categoría ya no está disponible",
    );
  });

  it("explains the financial impact before applying active sale conditions", async () => {
    const onApplyActiveConditions = vi.fn(async () => undefined);
    render(
      <WizardHarness
        activePublication
        onPublish={async () => undefined}
        onApplyActiveConditions={onApplyActiveConditions}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.change(await screen.findByLabelText(/Marca/), {
      target: { value: "P de Papel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Condiciones de venta")).toBeVisible();
    fireEvent.click(
      screen.getByRole("radio", {
        name: /Hasta 6 cuotas con 0% interés/,
      }),
    );
    expect(screen.getByText(/P de Papel recibe.*menos/)).toBeVisible();
    expect(screen.getByText(/reduce el costo desde/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar condiciones" }));

    expect(onApplyActiveConditions).toHaveBeenCalledOnce();
  });

  it("marks the exact field that blocks a step and clears it when corrected", async () => {
    render(<WizardHarness onPublish={async () => undefined} familyName="" />);

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    const familyName = screen.getByLabelText(/Nombre de familia en Mercado Libre/);
    expect(familyName).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escribe el nombre de familia",
    );
    expect(familyName).toHaveFocus();
    // Sigue en el paso 1.
    expect(
      screen.queryByLabelText("Categoría de Mercado Libre"),
    ).not.toBeInTheDocument();

    fireEvent.change(familyName, { target: { value: "Lapicero kawaii" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    // Marca obligatoria vacía: el error queda junto al campo de la ficha.
    const brand = await screen.findByLabelText(/Marca/);
    expect(brand).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Completa «BRAND»");
    expect(brand).toHaveFocus();
  });

  it("stays on the technical sheet when the pricing lookup fails", async () => {
    const onLoadPriceEstimate = vi.fn(async () => false);
    render(
      <WizardHarness
        onPublish={async () => undefined}
        onLoadPriceEstimate={onLoadPriceEstimate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.change(await screen.findByLabelText(/Marca/), {
      target: { value: "P de Papel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onLoadPriceEstimate).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Condiciones de venta")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Marca/)).toBeVisible();
  });

  it("saves each step before moving on and stops when saving fails", async () => {
    const onPersistStep = vi
      .fn<(step: 1 | 2 | 3 | 4) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    render(
      <WizardHarness
        onPublish={async () => undefined}
        onPersistStep={onPersistStep}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByLabelText(/^Categoría de Mercado Libre/),
    ).toBeVisible();
    expect(onPersistStep).toHaveBeenLastCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onPersistStep).toHaveBeenLastCalledWith(2);
    // El guardado del paso 2 falló: no se avanza a la ficha técnica.
    expect(screen.getByLabelText(/^Categoría de Mercado Libre/)).toBeVisible();
    expect(screen.queryByLabelText(/Marca/)).not.toBeInTheDocument();
  });

  it("reopens on the rejected step with Mercado Libre's message on the field", () => {
    render(
      <WizardHarness
        onPublish={async () => undefined}
        initialStep={3}
        initialIssue={{
          field: "attribute:BRAND",
          message: "Mercado Libre rechazó el atributo BRAND",
        }}
      />,
    );

    const brand = screen.getByLabelText(/Marca/);
    expect(brand).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mercado Libre rechazó el atributo BRAND",
    );
  });

  it("does not require a GTIN for a product flagged without identifier", async () => {
    render(
      <WizardHarness onPublish={async () => undefined} hasNoProductIdentifier />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    const gtin = await screen.findByLabelText(/Código universal de producto/);
    // Editable: una marca registrada exige el código real aunque el producto esté marcado sin él.
    expect(gtin).toHaveAttribute("placeholder", "Código de barras, si el producto lo tiene");
    expect(gtin).not.toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText(/Marca/), {
      target: { value: "P de Papel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Condiciones de venta")).toBeVisible();
  });

  it("shows the path beside each suggestion and keeps the list while typing", () => {
    render(
      <WizardHarness
        onPublish={async () => undefined}
        initialStep={2}
        suggestions={[
          {
            categoryId: "MCO123",
            categoryName: "Lapiceros",
            domainId: "MCO-PENS",
            domainName: "Lapiceros y bolígrafos",
            path: ["Papelería", "Escritura", "Lapiceros"],
          },
          {
            categoryId: "MCO456",
            categoryName: "Marcadores",
            domainId: null,
            domainName: "Marcadores",
            path: [],
          },
        ]}
        suggestionsNotice="Mercado Libre no respondió por 1 de las categorías sugeridas."
      />,
    );

    const list = screen.getByRole("list", {
      name: "Categorías sugeridas por Mercado Libre",
    });
    expect(list).toHaveTextContent("Papelería › Escritura › Lapiceros");
    expect(list).toHaveTextContent("Marcadores");
    expect(screen.getByRole("status")).toHaveTextContent("no respondió por 1");
    // La sugerencia que coincide con el código escrito aparece marcada.
    expect(screen.getByRole("button", { name: /Lapiceros/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.change(screen.getByLabelText(/^Categoría de Mercado Libre/), {
      target: { value: "MCO4" },
    });
    expect(
      screen.getByRole("list", { name: "Categorías sugeridas por Mercado Libre" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Lapiceros/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("lets a list attribute take a free value when no option matches", async () => {
    render(
      <WizardHarness
        onPublish={async () => undefined}
        initialStep={3}
        withColorList
      />,
    );

    // Un valor guardado fuera de la lista se edita como texto libre.
    expect(screen.getByLabelText(/^Color/)).toHaveAttribute("role", "combobox");
    fireEvent.change(screen.getByLabelText(/^Marca/), {
      target: { value: "P de Papel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Completa «COLOR»");
  });

  it("names the current step at phone width and marks required fields", () => {
    render(<WizardHarness onPublish={async () => undefined} />);

    expect(screen.getByText("Paso 1 de 4 · Producto")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Nombre de familia en Mercado Libre* (obligatorio)"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\(opcional\)/)).not.toBeInTheDocument();
  });

  /** Escanear junto al selector elige el producto local por el mismo camino que la lista. */
  it("picks the local product from a scan next to the picker", async () => {
    const onProductChange = vi.fn();
    render(<WizardHarness onPublish={async () => undefined} onProductChange={onProductChange} initialStep={1} />);
    fireEvent.click(await screen.findByRole("button", { name: "Escanear producto local" }));
    expect(onProductChange).toHaveBeenCalledWith("product-scan", expect.objectContaining({ id: "product-scan", sku: "TER-OWA-01" }));
  });

  // Lo que dejaba a Paula atascada (auditoría #18): fotos, categoría y ficha.
  describe("where Paula got stuck", () => {
    afterEach(() => {
      pictureMocks.sizes = {};
    });

    it("photos: says exactly which photo is too small for Mercado Libre and does not continue", async () => {
      pictureMocks.sizes = { "https://example.com/pequena.jpg": { width: 320, height: 400 } };
      const onPersistStep = vi.fn(async () => true);
      render(
        <WizardHarness
          onPublish={async () => undefined}
          initialStep={2}
          onPersistStep={onPersistStep}
          images={[{ url: "https://example.com/lapicero.jpg" }, { url: "https://example.com/pequena.jpg" }]}
        />,
      );
      expect(screen.getByText("Muy pequeña · 320×400")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
      expect(await screen.findByText(/La foto 2 mide 320 × 400 px; Mercado Libre pide al menos 500 × 500 px/)).toBeVisible();
      expect(onPersistStep).not.toHaveBeenCalled();
    });

    it("category: explains each suggestion, flags a wrong one for a kit, and searches what Paula types", async () => {
      const onSearchCategories = vi.fn(async () => undefined);
      render(
        <WizardHarness
          onPublish={async () => undefined}
          initialStep={2}
          isKit
          onSearchCategories={onSearchCategories}
          suggestions={[
            { categoryId: "MCO432665", categoryName: "Kits de Cuidado de la Piel", domainId: "MCO-SKIN_CARE_KITS", domainName: "Kits de cuidado de la piel", path: ["Belleza", "Cuidado de la Piel", "Kits"] },
          ]}
        />,
      );
      expect(screen.getByText(/no parece de papelería/)).toBeVisible();
      fireEvent.change(screen.getByLabelText("Buscar otra categoría"), { target: { value: "kit de papelería" } });
      fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
      expect(onSearchCategories).toHaveBeenCalledWith("kit de papelería");
      expect(await screen.findByText(/Mercado Libre la sugiere para «kit de papelería»/)).toBeVisible();
    });

    it("ficha: every conditionally required attribute has its own field with an explanation", async () => {
      render(
        <WizardHarness
          onPublish={async () => undefined}
          initialStep={3}
          extraAttributes={[
            { id: "UNITS_PER_PACK", name: "Cantidad de artículos", required: false, conditionalRequired: true, valueType: "number", values: [] },
            { id: "MODEL", name: "Modelo", required: false, catalogRequired: true, valueType: "string", values: [] },
          ]}
        />,
      );
      expect(screen.getByLabelText(/Cantidad de artículos/)).toBeVisible();
      expect(screen.getByText("Mercado Libre puede exigirlo según el resto de la ficha.")).toBeVisible();
      expect(screen.getByLabelText(/Modelo/)).toBeVisible();
      expect(screen.getByText(/lo pide para su catálogo/)).toBeVisible();
    });

    it("publish waits for a passing validation of the current form", () => {
      const onValidate = vi.fn(async () => undefined);
      const { rerender } = render(<WizardHarness onPublish={async () => undefined} initialStep={4} onValidate={onValidate} validation={null} />);
      expect(screen.getByRole("button", { name: "Publicar ahora" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Validar con Mercado Libre" }));
      expect(onValidate).toHaveBeenCalled();

      rerender(<WizardHarness onPublish={async () => undefined} initialStep={4} onValidate={onValidate} validation={{ ok: true, current: false, errors: [], warnings: [] }} />);
      expect(screen.getByText(/Cambiaste algo después de validar/)).toBeVisible();
      expect(screen.getByRole("button", { name: "Publicar ahora" })).toBeDisabled();

      rerender(<WizardHarness onPublish={async () => undefined} initialStep={4} onValidate={onValidate} validation={{ ok: true, current: true, errors: [], warnings: [] }} />);
      expect(screen.getByText(/Mercado Libre aceptó esta publicación/)).toBeVisible();
      expect(screen.getByRole("button", { name: "Publicar ahora" })).toBeEnabled();
    });

    it("a validation error takes Paula to the exact field", async () => {
      render(
        <WizardHarness
          onPublish={async () => undefined}
          initialStep={4}
          onValidate={async () => undefined}
          validation={{
            ok: false,
            current: true,
            errors: [{ step: "ficha", field: "BRAND", message: "Mercado Libre exige el campo «BRAND» en la ficha técnica." }],
            warnings: [],
          }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Ir al campo" }));
      const brand = await screen.findByLabelText(/Marca/);
      expect(brand).toHaveAttribute("aria-invalid", "true");
      expect(screen.getAllByText("Mercado Libre exige el campo «BRAND» en la ficha técnica.").length).toBeGreaterThan(0);
    });
  });

  // Comisión real del harness (4.560), envío obligatorio estimado (8.100), retenciones 1,5 %, costo 7.000.
  describe("margin on Mercado Libre", () => {
    it("shows the breakdown and the suggested price for the target profit", () => {
      render(<WizardHarness onPublish={async () => undefined} initialStep={4} />);
      const margin = document.getElementById("mercadolibre-margin")!;
      expect(margin).toHaveTextContent("Precio sugerido: $ 34.900");
      expect(margin).toHaveTextContent("Deja la ganancia objetivo de $ 12.000 por unidad.");
      expect(margin).toHaveTextContent("Retenciones (estimado 1,5 %)");
      expect(margin).toHaveTextContent("Envío que pagas (estimado)");
      expect(margin).toHaveTextContent("Te queda por unidad$ 3.980");
    });

    it("warns in plain Spanish below break-even and offers the suggested price", () => {
      render(<WizardHarness onPublish={async () => undefined} initialStep={4} initialPrice="15000" />);
      expect(screen.getByText(/Con este precio pierdes \$ 4\.885 por unidad/)).toBeVisible();
      const use = screen.getByRole("button", { name: /^Usar \$/ });
      const suggested = use.textContent!.replace("Usar ", "").replace(/\s/g, " ");
      fireEvent.click(use);
      expect(screen.queryByText(/Con este precio pierdes/)).toBeNull();
      expect(document.getElementById("mercadolibre-margin")).toHaveTextContent(`Precio${suggested}`);
    });
  });

  it("says when a product has no registered cost instead of proposing a price", () => {
    render(<WizardHarness onPublish={async () => undefined} noCost />);
    expect(screen.getByText(/no tiene costo registrado, así que no se puede\s+sugerir un precio/)).toBeVisible();
  });
});
