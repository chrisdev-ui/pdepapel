import { describe, expect, it } from "vitest";

import { parseMercadoLibreRemoteItemStatus } from "@/lib/mercadolibre/remote-status";

describe("estado del ítem en Mercado Libre", () => {
  it("toma estado, subestado, cantidad, fotos y envío gratis de /items/{id}", () => {
    const parsed = parseMercadoLibreRemoteItemStatus({
      id: "MCO4594183572",
      status: "paused",
      sub_status: ["out_of_stock"],
      title: "Set Resaltadores Scribe Incolors 10 Colores",
      price: 51900,
      category_id: "MCO172631",
      listing_type_id: "gold_pro",
      available_quantity: 1,
      sold_quantity: 0,
      pictures: [{ id: "a" }, { id: "b" }, { id: "c" }],
      shipping: { free_shipping: true, mode: "me2" },
      permalink: "https://articulo.mercadolibre.com.co/MCO-4594183572-x-_JM",
      last_updated: "2026-10-31T08:15:04.000Z",
    });
    expect(parsed).toMatchObject({
      itemId: "MCO4594183572",
      status: "paused",
      subStatus: ["out_of_stock"],
      localStatus: "PAUSED",
      availableQuantity: 1,
      pictureCount: 3,
      freeShipping: true,
      listingType: "gold_pro",
    });
  });

  it("en revisión queda pausada con su nota; lo que falta sale null, no inventado", () => {
    const parsed = parseMercadoLibreRemoteItemStatus({ status: "under_review" });
    expect(parsed.localStatus).toBe("PAUSED");
    expect(parsed.note).toMatch(/revisando/);
    expect(parsed).toMatchObject({ subStatus: [], pictureCount: null, freeShipping: null, price: null, permalink: null });
    expect(parseMercadoLibreRemoteItemStatus(null).status).toBeNull();
  });
});
