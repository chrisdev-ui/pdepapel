// @vitest-environment jsdom

import { ListingPublicationWizard } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listing-publication-wizard";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: () => <button type="button">Producto local</button>,
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
}: {
  onPublish: () => Promise<void>;
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
    marketplacePrice: "24000",
    categoryId: "MCO123",
    listingType: "gold_special",
    stockSafetyBuffer: "0",
    minimumMarginAmount: "12000",
    syncPrice: true,
    imageUrls: [product.images[0].url],
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
      selectedProduct={{ ...product, hasNoProductIdentifier }}
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
      onProductChange={() => undefined}
      onSearchCategories={async () => undefined}
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
    expect(gtin).toHaveAttribute(
      "placeholder",
      "Sin código de barras (marcado en el producto)",
    );
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
});
