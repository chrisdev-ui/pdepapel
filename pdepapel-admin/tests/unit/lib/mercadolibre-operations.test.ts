import { describe, expect, it } from "vitest";

import { createMercadoLibreContentReview } from "@/lib/mercadolibre/content-assistant";
import {
  parseMercadoLibreClaim,
  parseMercadoLibreShipment,
} from "@/lib/mercadolibre/logistics";
import { getShipmentStatusMeta } from "@/lib/mercadolibre/logistics-status";
import { createMercadoLibreQuestionSuggestion } from "@/lib/mercadolibre/questions";

describe("Mercado Libre operations", () => {
  it("keeps shipment destination details when Mercado Libre returns nested locations", () => {
    const shipment = parseMercadoLibreShipment({
      id: 1234,
      status: "ready_to_ship",
      destination: {
        shipping_address: {
          city: { name: "Medellín" },
          state: { name: "Antioquia" },
        },
      },
    });

    expect(shipment).toMatchObject({
      externalShipmentId: "1234",
      status: "ready_to_ship",
      metadata: {
        destinationCity: "Medellín",
        destinationState: "Antioquia",
      },
    });
  });

  it("translates shipment statuses for the administration panel", () => {
    expect(getShipmentStatusMeta("ready_to_ship")).toEqual({
      label: "Listo para despachar",
      variant: "warning",
    });
  });

  it("stores claim information for review without taking an automatic action", () => {
    const claim = parseMercadoLibreClaim({
      id: "claim-1",
      resource_id: "2000014415856007",
      status: "opened",
      detail: {
        title: "El comprador solicita ayuda",
        due_date: "2026-08-12T18:00:00.000Z",
      },
    });

    expect(claim).toMatchObject({
      externalClaimId: "claim-1",
      externalOrderId: "2000014415856007",
      status: "opened",
      title: "El comprador solicita ayuda",
    });
    expect(claim.dueAt).toEqual(new Date("2026-08-12T18:00:00.000Z"));
  });

  it("creates a reviewable stock-answer suggestion without claiming stock certainty", () => {
    const suggestion = createMercadoLibreQuestionSuggestion({
      question: "¿Todavía está disponible?",
      product: {
        name: "Agenda kawaii",
        description: "<p>Agenda rosada con separadores.</p>",
      },
    });

    expect(suggestion).toContain("mientras la publicación permita comprarlo");
    expect(suggestion).toContain("Agenda kawaii");
  });

  it("reviews content without changing a product or sending it to Mercado Libre", () => {
    const review = createMercadoLibreContentReview({
      categoryId: "MCO123",
      marketplacePrice: 29900,
      metadata: { attributes: [{ id: "COLOR", value_name: "Rosado" }] },
      product: {
        name: "Agenda kawaii con flores",
        description:
          "<p>Agenda con separadores, espacio para notas y detalles florales para organizar tus clases y días especiales.</p>",
        brand: "P de Papel",
        gtin: null,
        mpn: null,
        images: [{ url: "one" }, { url: "two" }, { url: "three" }],
      },
    });

    expect(review.checks.every((check) => check.ready)).toBe(true);
    expect(review.descriptionPreview).toContain("Agenda con separadores");
  });
});
