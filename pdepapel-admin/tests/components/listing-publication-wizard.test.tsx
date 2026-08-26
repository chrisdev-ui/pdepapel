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
  price: 12000,
  category: { id: "category-1", name: "Lapiceros" },
  images: [{ url: "https://example.com/lapicero.jpg" }],
};

function WizardHarness({
  onPublish,
  onSuggestPrice = async () => undefined,
  onApplyActiveConditions = async () => undefined,
  activePublication = false,
  error = null,
}: {
  onPublish: () => Promise<void>;
  onSuggestPrice?: () => Promise<void>;
  onApplyActiveConditions?: () => Promise<void>;
  activePublication?: boolean;
  error?: string | null;
}) {
  const [form, setForm] = useState({
    productId: product.id,
    familyName: "Lapicero kawaii",
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
      activePublication={activePublication}
      activeSaleConditions={activeSaleConditions}
      canPublishDirectly={!activePublication}
      form={form}
      setForm={setForm}
      error={error}
      selectedProduct={product}
      suggestions={[]}
      categoryAttributes={[
        {
          id: "BRAND",
          name: "Marca",
          required: true,
          valueType: "string",
          values: [],
        },
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
      onError={() => undefined}
      onFormChange={(key, value) =>
        setForm((current) => ({ ...current, [key]: value }))
      }
      onProductChange={() => undefined}
      onSearchCategories={async () => undefined}
      onCategoryChange={(categoryId) =>
        setForm((current) => ({ ...current, categoryId }))
      }
      onLoadCategoryAttributes={async () => true}
      onLoadPriceEstimate={async () => undefined}
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
      screen.getByLabelText("Nombre de familia en Mercado Libre"),
    ).toHaveValue("Lapicero kawaii");

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByLabelText("Categoría de Mercado Libre")).toBeVisible();

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
    expect(screen.getByLabelText("Categoría de Mercado Libre")).toBeVisible();
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
});
