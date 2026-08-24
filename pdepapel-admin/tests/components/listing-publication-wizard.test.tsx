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
}: {
  onPublish: () => Promise<void>;
  onSuggestPrice?: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    productId: product.id,
    familyName: "Lapicero kawaii",
    marketplacePrice: "24000",
    categoryId: "MCO123",
    stockSafetyBuffer: "0",
    minimumMarginAmount: "12000",
    syncPrice: true,
    imageUrls: [product.images[0].url],
    attributes: "",
  });

  return (
    <ListingPublicationWizard
      storeId="store-1"
      editing={false}
      canPublishDirectly
      form={form}
      setForm={setForm}
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
      categoryTemplates={[]}
      quickProfile={{
        id: "profile-1",
        name: "Lapiceros · Mercado Libre",
        categoryId: "MCO123",
        stockSafetyBuffer: 0,
        minimumMarginAmount: 12000,
        localCategory: product.category,
      }}
      priceEstimate={null}
      isSearchingCategories={false}
      isLoadingCategoryAttributes={false}
      isLoadingPriceEstimate={false}
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

    expect(screen.getAllByText("Lapicero kawaii")).toHaveLength(2);
    expect(screen.getByText("Precio de la tienda en línea")).toBeVisible();
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

    expect(screen.getByText("Precio de venta en Mercado Libre")).toBeVisible();
    expect(screen.getByText(/Diferencia frente a tienda:/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sugerir precio de Mercado Libre",
      }),
    );

    expect(onSuggestPrice).toHaveBeenCalledOnce();
  });
});
