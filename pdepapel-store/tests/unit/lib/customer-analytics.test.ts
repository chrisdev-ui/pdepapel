import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics/react", () => ({ track: vi.fn() }));

import {
  enableGoogleAnalytics,
  getAnalyticsValue,
  toAnalyticsItem,
} from "@/lib/customer-analytics";
import { Product } from "@/types";

const testBrand = (isPublic: boolean) => ({
  name: "Marca de prueba",
  slug: "marca-de-prueba",
  logoUrl: null,
  logoHasBackground: false,
  logoPermission: "UNKNOWN" as const,
  color: null,
  isPublic,
  parent: null,
});

const product = {
  brand: testBrand(true),
  category: { id: "category-id", name: "Agendas", typeId: "type-id" },
  color: { id: "color-id", name: "Lila", value: "#c9b6e4" },
  description: "Agenda con flores",
  design: { id: "design-id", name: "Flores" },
  id: "product-id",
  images: [],
  isFeatured: false,
  name: "Agenda floral",
  price: "18000",
  reviews: [],
  size: { id: "size-id", name: "Mediana", value: "M" },
  sku: "AGENDA-001",
  stock: 4,
} as Product;

describe("customer analytics items", () => {
  it("uses catalog metadata without customer information", () => {
    expect(toAnalyticsItem(product, 2)).toEqual({
      item_brand: "Marca de prueba",
      item_category: "Agendas",
      item_id: "AGENDA-001",
      item_name: "Agenda floral",
      item_variant: "Flores · Lila",
      price: 18000,
      quantity: 2,
    });
  });

  it("sends the brand name even when the brand is hidden in the store", () => {
    expect(toAnalyticsItem({ ...product, brand: testBrand(false) }).item_brand).toBe("Marca de prueba");
  });

  it("never sends an old brand text kept in a stored cart", () => {
    expect(toAnalyticsItem({ ...product, brand: "Texto viejo" as unknown as Product["brand"] }).item_brand).toBeUndefined();
    expect(toAnalyticsItem({ ...product, brand: null }).item_brand).toBeUndefined();
  });

  it("takes the group brand when the product carries none", () => {
    const grouped = { ...product, brand: null, productGroup: { id: "g", name: "Grupo", brand: testBrand(true) } } as Product;
    expect(toAnalyticsItem(grouped).item_brand).toBe("Marca de prueba");
  });

  it("calculates event value from item prices and quantities", () => {
    expect(
      getAnalyticsValue([
        { item_id: "one", item_name: "Uno", price: 10000, quantity: 2 },
        { item_id: "two", item_name: "Dos", price: 5000, quantity: 1 },
      ]),
    ).toBe(25000);
  });
});

describe("Google Analytics initialization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues commands using the Google tag arguments format", () => {
    const appendedScripts: Array<{ id?: string; async?: boolean; src?: string }> = [];

    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({})),
      getElementById: vi.fn(() => null),
      head: {
        appendChild: vi.fn((script) => appendedScripts.push(script)),
      },
    });

    enableGoogleAnalytics("G-TEST123");

    const commands = window.dataLayer ?? [];
    expect(commands).toHaveLength(4);
    expect(Object.prototype.toString.call(commands[0])).toBe(
      "[object Arguments]",
    );
    expect(Array.from(commands[3] as IArguments)).toEqual([
      "config",
      "G-TEST123",
      { anonymize_ip: true, send_page_view: false },
    ]);
    expect(appendedScripts).toEqual([
      {
        async: true,
        id: "pdepapel-google-analytics",
        src: "https://www.googletagmanager.com/gtag/js?id=G-TEST123",
      },
    ]);
  });
});
