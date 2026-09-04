// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vercelMocks = vi.hoisted(() => ({ track: vi.fn() }));
const clarityMocks = vi.hoisted(() => ({ trackMicrosoftClarityEvent: vi.fn() }));

vi.mock("@vercel/analytics/react", () => vercelMocks);
vi.mock("@/lib/microsoft-clarity", () => clarityMocks);

import { ANALYTICS_CONSENT_STORAGE_KEY } from "@/lib/analytics-consent";
import {
  disableGoogleAnalytics,
  enableGoogleAnalytics,
  getGoogleAnalyticsClientId,
  toAnalyticsItem,
  trackCustomerEvent,
  trackGooglePageView,
} from "@/lib/customer-analytics";
import { Product } from "@/types";

const baseProduct = {
  brand: "",
  category: { id: "category-id", name: "Agendas", typeId: "type-id" },
  description: "Agenda",
  id: "product-id",
  images: [],
  isFeatured: false,
  name: "Agenda",
  price: "18000",
  reviews: [],
  sku: "",
  stock: 4,
} as unknown as Product;

function grantConsent(analytics = true) {
  window.localStorage.setItem(
    ANALYTICS_CONSENT_STORAGE_KEY,
    JSON.stringify({ analytics, updatedAt: "2026-09-04T00:00:00.000Z" }),
  );
}

describe("customer analytics item mapping edge cases", () => {
  it("falls back to the product id, discounted price, and omits empty variant parts", () => {
    expect(
      toAnalyticsItem({ ...baseProduct, discountedPrice: 15000 } as Product),
    ).toEqual({
      item_brand: undefined,
      item_category: "Agendas",
      item_id: "product-id",
      item_name: "Agenda",
      item_variant: undefined,
      price: 15000,
    });
  });

  it("uses the minimum price of a group and the structured size in the variant", () => {
    const item = toAnalyticsItem(
      {
        ...baseProduct,
        minPrice: 12000,
        catalogOptionValues: [
          {
            option: { key: "formato", name: "Formato" },
            optionValue: { name: "A5" },
          },
        ],
      } as unknown as Product,
      3,
    );

    expect(item.price).toBe(12000);
    expect(item.item_variant).toBe("A5");
    expect(item.quantity).toBe(3);
  });

  it("uses zero when no price candidate is a finite number", () => {
    expect(
      toAnalyticsItem({ ...baseProduct, price: "no-price" } as Product).price,
    ).toBe(0);
  });
});

describe("customer analytics tracking", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.dataLayer;
    delete window.gtag;
    document.head.innerHTML = "";
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing without analytics consent", () => {
    window.gtag = vi.fn();

    trackCustomerEvent("view_item", { value: 1 });
    trackGooglePageView("/tienda", "Tienda");

    expect(vercelMocks.track).not.toHaveBeenCalled();
    expect(window.gtag).not.toHaveBeenCalled();
    expect(clarityMocks.trackMicrosoftClarityEvent).not.toHaveBeenCalled();
  });

  it("forwards consented events to Vercel, GA4, and Clarity with primitive-only Vercel params", () => {
    grantConsent();
    window.gtag = vi.fn();

    trackCustomerEvent("add_to_cart", {
      value: 18000,
      currency: "COP",
      in_stock: true,
      note: null,
      items: [{ item_id: "x" }],
      nested: { a: 1 },
    });

    expect(vercelMocks.track).toHaveBeenCalledWith("add_to_cart", {
      value: 18000,
      currency: "COP",
      in_stock: true,
      note: null,
    });
    expect(window.gtag).toHaveBeenCalledWith(
      "event",
      "add_to_cart",
      expect.objectContaining({ items: [{ item_id: "x" }] }),
    );
    expect(clarityMocks.trackMicrosoftClarityEvent).toHaveBeenCalledWith(
      "add_to_cart",
      expect.objectContaining({ value: 18000 }),
    );
  });

  it("sends page views with the current location once consented", () => {
    grantConsent();
    window.gtag = vi.fn();

    trackGooglePageView("/producto/agenda", "Agenda");

    expect(window.gtag).toHaveBeenCalledWith("event", "page_view", {
      page_location: window.location.href,
      page_path: "/producto/agenda",
      page_title: "Agenda",
    });
  });

  it("enables once and does not append the tag script twice", () => {
    enableGoogleAnalytics("G-TEST123");
    enableGoogleAnalytics("G-TEST123");

    expect(
      document.querySelectorAll("#pdepapel-google-analytics"),
    ).toHaveLength(1);
    expect(window.dataLayer).toHaveLength(8);
  });

  it("ignores an empty measurement id", () => {
    enableGoogleAnalytics("");

    expect(window.dataLayer).toBeUndefined();
    expect(document.getElementById("pdepapel-google-analytics")).toBeNull();
  });

  it("denies storage and clears GA cookies when disabled", () => {
    window.gtag = vi.fn();
    document.cookie = "_ga=GA1.1.123; path=/";
    document.cookie = "_ga_ABC123=GS1.1.456; path=/";
    document.cookie = "other=keep; path=/";

    disableGoogleAnalytics();

    expect(window.gtag).toHaveBeenCalledWith("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
    expect(document.cookie).not.toContain("_ga=");
    expect(document.cookie).not.toContain("_ga_ABC123=");
    expect(document.cookie).toContain("other=keep");
  });

  it("does not throw when disabling before the tag exists", () => {
    expect(() => disableGoogleAnalytics()).not.toThrow();
  });

  it("resolves the GA4 client id only with consent and a loaded tag", async () => {
    await expect(getGoogleAnalyticsClientId("G-TEST123")).resolves.toBeNull();

    grantConsent();
    await expect(getGoogleAnalyticsClientId("G-TEST123")).resolves.toBeNull();
    await expect(getGoogleAnalyticsClientId("")).resolves.toBeNull();

    window.gtag = vi.fn((...args: unknown[]) => {
      const callback = args[3];
      if (typeof callback === "function") callback("123.456");
    });
    await expect(getGoogleAnalyticsClientId("G-TEST123")).resolves.toBe(
      "123.456",
    );

    window.gtag = vi.fn((...args: unknown[]) => {
      const callback = args[3];
      if (typeof callback === "function") callback(undefined);
    });
    await expect(getGoogleAnalyticsClientId("G-TEST123")).resolves.toBeNull();
  });

  it("gives up on the client id after 250 ms if the tag never answers", async () => {
    vi.useFakeTimers();
    grantConsent();
    window.gtag = vi.fn();

    const pending = getGoogleAnalyticsClientId("G-TEST123");
    await vi.advanceTimersByTimeAsync(300);

    await expect(pending).resolves.toBeNull();
  });
});
