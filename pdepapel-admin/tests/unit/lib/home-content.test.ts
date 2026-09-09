import { describe, expect, it } from "vitest";

import {
  HomeContentValidationError,
  dateInputToBogotaEnd,
  dateInputToBogotaStart,
  dateToBogotaInput,
  getHomeContentStatus,
  homeContentDataFromInput,
  parseHomeContentBody,
  pickLiveHomeContent,
} from "@/lib/home-content";

const NOW = new Date("2026-09-09T15:00:00.000Z");

const base = {
  placement: "HERO" as const,
  title: "Papelería kawaii desde Medellín",
  imageUrl: "https://res.cloudinary.com/demo/image/upload/hero.jpg",
  startsAt: "2026-09-01",
};

describe("home content dates", () => {
  it("interprets form dates in Bogotá time", () => {
    expect(dateInputToBogotaStart("2026-09-09").toISOString()).toBe("2026-09-09T05:00:00.000Z");
    expect(dateInputToBogotaEnd("2026-09-09").toISOString()).toBe("2026-09-10T04:59:59.999Z");
    expect(dateToBogotaInput(new Date("2026-09-10T04:30:00.000Z"))).toBe("2026-09-09");
    expect(dateToBogotaInput(null)).toBe("");
  });
});

describe("home content status", () => {
  it("derives the status from activity and dates", () => {
    expect(getHomeContentStatus({ isActive: false, startsAt: "2026-09-01", endsAt: null }, NOW)).toBe("borrador");
    expect(getHomeContentStatus({ isActive: true, startsAt: "2026-10-01", endsAt: null }, NOW)).toBe("programada");
    expect(getHomeContentStatus({ isActive: true, startsAt: "2026-08-01", endsAt: "2026-08-31" }, NOW)).toBe("vencida");
    expect(getHomeContentStatus({ isActive: true, startsAt: "2026-09-01", endsAt: "2026-09-30" }, NOW)).toBe("en-vivo");
  });

  it("picks the live entry with the most recent start", () => {
    const entries = [
      { id: "old", isActive: true, startsAt: "2026-08-01", endsAt: null },
      { id: "new", isActive: true, startsAt: "2026-09-05", endsAt: null },
      { id: "future", isActive: true, startsAt: "2026-10-01", endsAt: null },
      { id: "draft", isActive: false, startsAt: "2026-09-08", endsAt: null },
    ];
    expect(pickLiveHomeContent(entries, NOW)?.id).toBe("new");
    expect(pickLiveHomeContent([entries[2], entries[3]], NOW)).toBeNull();
  });
});

describe("parseHomeContentBody", () => {
  it("accepts a hero and normalizes empty strings to null", () => {
    const input = parseHomeContentBody({ ...base, eyebrow: "  ", primaryLabel: "Ver la tienda", primaryUrl: "/tienda", endsAt: "" });
    const data = homeContentDataFromInput(input);
    expect(data.eyebrow).toBeNull();
    expect(data.campaignType).toBeNull();
    expect(data.primaryUrl).toBe("/tienda");
    expect(data.endsAt).toBeNull();
    expect(data.startsAt.toISOString()).toBe("2026-09-01T05:00:00.000Z");
  });

  it("requires a campaign type and image for campaigns", () => {
    expect(() => parseHomeContentBody({ ...base, placement: "CAMPAIGN" })).toThrow(HomeContentValidationError);
    expect(() => parseHomeContentBody({ ...base, placement: "CAMPAIGN", campaignType: "SEASON", imageUrl: "" })).toThrow(
      "Este banner necesita una imagen",
    );
  });

  it("lets a shipment campaign skip the image and carry up to three products", () => {
    const input = parseHomeContentBody({
      ...base,
      placement: "CAMPAIGN",
      campaignType: "SHIPMENT",
      imageUrl: "",
      productIds: ["a", "b", "c"],
    });
    expect(input.productIds).toHaveLength(3);
    expect(() => parseHomeContentBody({ ...base, placement: "CAMPAIGN", campaignType: "SEASON", productIds: ["a"] })).toThrow(
      "Solo un banner de cargamento muestra productos",
    );
  });

  it("rejects buttons without a link, bad urls and inverted dates", () => {
    expect(() => parseHomeContentBody({ ...base, primaryLabel: "Ver" })).toThrow("El botón principal necesita un enlace");
    expect(() => parseHomeContentBody({ ...base, primaryLabel: "Ver", primaryUrl: "tienda" })).toThrow("ruta interna");
    expect(() => parseHomeContentBody({ ...base, endsAt: "2026-08-01" })).toThrow("La fecha de fin");
  });
});
