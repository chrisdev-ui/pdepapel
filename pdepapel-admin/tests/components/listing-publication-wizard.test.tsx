// @vitest-environment jsdom

import { ListingPublicationWizard } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listing-publication-wizard";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

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

function WizardHarness({ onPublish }: { onPublish: () => Promise<void> }) {
  const [form, setForm] = useState({
    productId: product.id,
    marketplacePrice: "24000",
    categoryId: "MCO123",
    stockSafetyBuffer: "1",
    minimumMarginAmount: "",
    syncPrice: true,
    imageUrls: [product.images[0].url],
    attributes: "",
  });

  return (
    <ListingPublicationWizard
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
        stockSafetyBuffer: 1,
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
      onApplyCategoryTemplate={() => undefined}
      onSaveCategoryTemplate={async () => undefined}
      onSaveQuickProfile={async () => undefined}
      onSave={async () => undefined}
      onSaveAndPublish={onPublish}
    />
  );
}

describe("ListingPublicationWizard", () => {
  it("guides an administrator from product details to direct publishing", async () => {
    const onPublish = vi.fn(async () => undefined);
    render(<WizardHarness onPublish={onPublish} />);

    expect(
      screen.queryByText(/videos de la publicación/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Perfil rápido aplicado/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByLabelText("Categoría de Mercado Libre")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByLabelText(/Marca/)).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Marca/), {
      target: { value: "P de Papel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Lapicero kawaii")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Publicar ahora" }));

    expect(onPublish).toHaveBeenCalledOnce();
  });
});
