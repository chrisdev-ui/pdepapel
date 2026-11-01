import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { type HomeContentRow, parseHomeContentBody, selectLiveHomeContent } from "@/lib/home-content";
import { presaleCampaignOffer } from "@/lib/home-content-presale";

const NOW = new Date("2026-11-01T15:00:00.000Z");

const product = {
  id: "kiut",
  name: "Calendario de adviento Kiut Love Letters",
  slug: "calendario-de-adviento-kiut-love-letters",
  price: 160_000,
  stock: 0,
  reservedUnits: 0,
  isArchived: false,
  images: [{ url: "https://res.cloudinary.com/demo/image/upload/kiut.png" }],
};

function row(overrides: Partial<HomeContentRow> = {}): HomeContentRow {
  return {
    id: "campaign-kiut",
    placement: "CAMPAIGN",
    campaignType: "PRESALE",
    eyebrow: "Preventa · llega en diciembre",
    title: "Calendario de Adviento Kiut",
    subtitle: null,
    primaryLabel: null,
    primaryUrl: null,
    secondaryLabel: null,
    secondaryUrl: null,
    imageUrl: null,
    mobileImageUrl: null,
    imageAlt: null,
    promotionId: "kiut-adviento-2026",
    isActive: true,
    startsAt: new Date("2026-11-01T05:00:00.000Z"),
    endsAt: null,
    earlyAccessSentAt: null,
    arrivalSentAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    products: [{ position: 0, product: { ...product, price: product.price as never } }],
    ...overrides,
  } as HomeContentRow;
}

type Presale = Parameters<typeof presaleCampaignOffer>[1] extends Map<string, infer V> ? V : never;
const deposit: Presale = { unitLimit: null, committedUnits: 2, heldUnits: 0, paymentMode: "DEPOSIT", depositType: "FIXED", depositValue: 30_000 };
const presales = (value: Presale = deposit) => new Map([["kiut", value]]);

describe("banner de preventa: los números salen de la preventa y del checkout", () => {
  it("anticipo fijo de 30.000 y abono desde 10.000 (MIN_ONLINE_INSTALLMENT)", () => {
    expect(presaleCampaignOffer(row(), presales())).toMatchObject({
      price: 160_000,
      depositPerUnit: 30_000,
      minInstallment: 10_000,
      slug: "calendario-de-adviento-kiut-love-letters",
      paymentMode: "DEPOSIT",
    });
  });

  it("anticipo en porcentaje, saldo menor al mínimo y pago completo", () => {
    expect(presaleCampaignOffer(row(), presales({ ...deposit, depositType: "PERCENT", depositValue: 25 }))?.depositPerUnit).toBe(40_000);
    expect(presaleCampaignOffer(row(), presales({ ...deposit, depositValue: 155_000 }))?.minInstallment).toBe(5_000);
    expect(presaleCampaignOffer(row(), presales({ ...deposit, paymentMode: "FULL", depositType: null, depositValue: null }))).toMatchObject({
      depositPerUnit: 160_000,
      minInstallment: null,
    });
  });

  it("se oculta sola: producto archivado, sin preventa activa o con el cupo lleno", () => {
    const archived = row({ products: [{ position: 0, product: { ...product, isArchived: true, price: product.price as never } }] as never });
    expect(presaleCampaignOffer(archived, presales())).toBeNull();
    expect(presaleCampaignOffer(row(), new Map())).toBeNull();
    expect(presaleCampaignOffer(row(), presales({ ...deposit, unitLimit: 3, committedUnits: 2, heldUnits: 1 }))).toBeNull();
    expect(presaleCampaignOffer(row(), presales({ ...deposit, unitLimit: 3, committedUnits: 2, heldUnits: 0 }))).not.toBeNull();
  });
});

describe("selectLiveHomeContent con una preventa", () => {
  const offerFor = (map: ReturnType<typeof presales> | Map<string, never>) => (entry: HomeContentRow) => presaleCampaignOffer(entry, map);

  it("arma el botón hacia la ficha, el id de GA4 y la foto del producto cuando Paula no puso otra", () => {
    const { campaign } = selectLiveHomeContent([row()], NOW, offerFor(presales()));
    expect(campaign).toMatchObject({
      primaryLabel: "Separar el mío",
      primaryUrl: "/producto/calendario-de-adviento-kiut-love-letters",
      promotionId: "kiut-adviento-2026",
      imageUrl: product.images[0].url,
      imageAlt: product.name,
      presale: { depositPerUnit: 30_000, minInstallment: 10_000 },
    });
  });

  it("si la preventa se cierra, otra campaña vigente toma el lugar", () => {
    const older = row({ id: "temporada", campaignType: "SEASON", startsAt: new Date("2026-10-01T05:00:00.000Z"), imageUrl: "https://x/y.jpg", products: [] });
    expect(selectLiveHomeContent([row(), older], NOW, offerFor(presales())).campaign?.id).toBe("campaign-kiut");
    expect(selectLiveHomeContent([row(), older], NOW, offerFor(new Map())).campaign?.id).toBe("temporada");
    expect(selectLiveHomeContent([row()], NOW, offerFor(new Map())).campaign).toBeNull();
  });

  it("sin id de GA4 usa el id del contenido", () => {
    expect(selectLiveHomeContent([row({ promotionId: null })], NOW, offerFor(presales())).campaign?.promotionId).toBe("campaign-kiut");
  });
});

describe("formulario: reglas de la preventa", () => {
  const body = { placement: "CAMPAIGN", campaignType: "PRESALE", title: "Calendario de Adviento Kiut", startsAt: "2026-11-01" };

  it("pide exactamente un producto y deja la foto opcional", () => {
    expect(() => parseHomeContentBody({ ...body, productIds: [] })).toThrow("Elige el producto en preventa (uno solo)");
    expect(() => parseHomeContentBody({ ...body, productIds: ["a", "b"] })).toThrow("Elige el producto en preventa (uno solo)");
    expect(parseHomeContentBody({ ...body, productIds: ["kiut"] }).productIds).toEqual(["kiut"]);
  });

  it("con el botón por defecto del formulario («Separar el mío», sin enlace) se guarda; otros tipos siguen pidiendo enlace", () => {
    const presale = parseHomeContentBody({ ...body, productIds: ["kiut"], primaryLabel: "Separar el mío", primaryUrl: "" });
    expect(presale.primaryLabel).toBe("Separar el mío");
    expect(() => parseHomeContentBody({ ...body, campaignType: "SEASON", imageUrl: "https://x/y.jpg", primaryLabel: "Ver", primaryUrl: "" })).toThrow("El botón principal necesita un enlace");
  });

  it("el id de GA4 va en minúsculas con guiones", () => {
    expect(() => parseHomeContentBody({ ...body, productIds: ["kiut"], promotionId: "Kiut Adviento" })).toThrow(/minúsculas/);
    expect(parseHomeContentBody({ ...body, productIds: ["kiut"], promotionId: "kiut-adviento-2026" }).promotionId).toBe("kiut-adviento-2026");
  });

  it("los otros tipos siguen sin productos, salvo el cargamento", () => {
    expect(() => parseHomeContentBody({ ...body, campaignType: "SEASON", imageUrl: "https://x/y.jpg", productIds: ["kiut"] })).toThrow(/cargamento o de preventa/);
  });
});
