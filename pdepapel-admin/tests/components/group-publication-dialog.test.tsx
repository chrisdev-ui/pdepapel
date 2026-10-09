// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GroupPublicationDialog } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listings/group-publication-dialog";

const variant = (overrides: Record<string, unknown>) => ({
  productId: "p",
  name: "Tote",
  sku: "TOT",
  stock: 3,
  price: 30000,
  acqPrice: 20000,
  transportationCost: 0,
  isKit: false,
  brand: "Genérica",
  gtin: null,
  mpn: null,
  hasNoProductIdentifier: true,
  colorName: null,
  sizeName: null,
  designName: null,
  imageUrls: ["https://img/1.jpg"],
  isMaster: false,
  listingId: null,
  state: { kind: "ready", available: 2 },
  remoteItems: [],
  ...overrides,
});

const plan = {
  master: {
    listingId: "base",
    productId: "p-rosa",
    familyName: "Tote Bag Kawaii",
    categoryId: "MCO1",
    listingType: "gold_special",
    marketplacePrice: 60000,
    stockSafetyBuffer: 1,
    attributes: [
      { id: "BRAND", value_name: "Genérica" },
      { id: "COLOR", value_name: "Rosa" },
    ],
    saleConditions: { shippingMode: "me2", freeShipping: true, localPickUp: false, packageDimensions: { heightCm: 3, widthCm: 30, lengthCm: 35, weightGrams: 200 } },
  },
  group: { id: "g", name: "Tote kawaii", brand: "Genérica" },
  truncated: false,
  variants: [
    variant({ productId: "p-rosa", name: "Tote Rosa", isMaster: true, listingId: "base", state: { kind: "draft" } }),
    variant({ productId: "p-celeste", name: "Tote Celeste", colorName: "Celeste" }),
    variant({ productId: "p-lila", name: "Tote Lila", acqPrice: 40000, colorName: "Lila" }),
    variant({
      productId: "p-menta",
      name: "Tote Menta",
      listingId: "l-menta",
      state: { kind: "listed", itemId: "MCO1", twins: ["MCO2"] },
    }),
  ],
};

function mockFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.includes("/listings/group") && init?.method === "POST") {
      return json({ familyBatchId: "batch", created: [{ listingId: "nuevo", productId: "p-celeste" }], skipped: [] }, 201);
    }
    if (url.includes("/listings/group")) return json(plan);
    if (url.includes("/attributes")) return json([{ id: "BRAND", required: true }, { id: "COLOR", required: true }]);
    if (url.includes("/pricing")) return json({ saleFeeAmount: 9000 });
    if (url.includes("/shipping-cost")) return json({ buyerPays: null, sellerOffersFree: { sellerCost: 9000 } });
    throw new Error(`fetch inesperado: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GroupPublicationDialog", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra cada variante con su estado, sus gemelas y su neto con el objetivo de la tienda", async () => {
    mockFetch();
    render(
      <GroupPublicationDialog
        storeId="s"
        listingId="base"
        pricingTargets={{ targetMarginPercent: 20, minNetPerUnit: 10000 }}
        onClose={() => undefined}
        onDraftsCreated={() => undefined}
        onPublish={() => undefined}
      />,
    );

    expect(await screen.findByText("Publicar grupo: Tote kawaii")).toBeInTheDocument();
    expect(screen.getByText(/Comparte stock y SKU con MCO2/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/después de comisión/)).toHaveLength(2));
    expect(screen.getAllByText(/después de comisión/)[0].textContent).toMatch(/Te quedan \$\s?21\.100 por unidad \(35\.2 %\)/);
    expect(screen.getByText(/por debajo del objetivo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear 2 borradores" })).toBeEnabled();
  });

  it("crea los borradores con la ficha de cada variante y publica solo con un clic aparte", async () => {
    const fetchMock = mockFetch();
    const onPublish = vi.fn();
    render(
      <GroupPublicationDialog
        storeId="s"
        listingId="base"
        pricingTargets={null}
        onClose={() => undefined}
        onDraftsCreated={() => undefined}
        onPublish={onPublish}
      />,
    );
    await screen.findByText("Tote Lila");
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir Tote Lila" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear 1 borrador" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Crear 1 borrador" }));

    await screen.findByText(/Todavía no se publicó nada/);
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      listingId: "base",
      variants: [
        {
          productId: "p-celeste",
          marketplacePrice: 60000,
          attributes: [
            { id: "BRAND", value_name: "Genérica" },
            { id: "COLOR", value_name: "Celeste" },
          ],
        },
      ],
    });
    expect(onPublish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Publicar 2 en Mercado Libre" }));
    expect(onPublish).toHaveBeenCalledWith(["nuevo", "base"]);
  });

  it("sin nombre de familia y con la base ya publicada, el texto y la etiqueta lo dicen bien", async () => {
    const published = {
      ...plan,
      master: { ...plan.master, familyName: null },
      variants: plan.variants.map((variant) =>
        variant.isMaster ? { ...variant, state: { kind: "listed", itemId: "MCO9", twins: [] } } : variant,
      ),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
        if (url.includes("/listings/group")) return json(published);
        if (url.includes("/attributes")) return json([]);
        if (url.includes("/pricing")) return json({ saleFeeAmount: 9000 });
        return json({ buyerPays: null, sellerOffersFree: { sellerCost: 9000 } });
      }),
    );
    render(
      <GroupPublicationDialog storeId="s" listingId="base" pricingTargets={null} onClose={() => undefined} onDraftsCreated={() => undefined} onPublish={() => undefined} />,
    );
    expect(await screen.findByText("Publicación base")).toBeInTheDocument();
    expect(screen.queryByText("Borrador base")).not.toBeInTheDocument();
    expect(screen.getByText(/Mercado Libre las agrupa por el nombre de familia del borrador base/)).toBeInTheDocument();
    expect(screen.queryByText(/nombre de familia;/)).not.toBeInTheDocument();
  });
});
