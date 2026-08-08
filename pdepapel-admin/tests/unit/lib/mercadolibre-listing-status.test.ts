import { describe, expect, it } from "vitest";

import { getListingStatusMeta } from "@/lib/mercadolibre/listing-status";

describe("getListingStatusMeta", () => {
  it("maps every persisted listing status to Spanish with a meaningful color", () => {
    expect(getListingStatusMeta("DRAFT")).toEqual({
      label: "Borrador",
      variant: "secondary",
    });
    expect(getListingStatusMeta("ACTIVE")).toEqual({
      label: "Activa",
      variant: "success",
    });
    expect(getListingStatusMeta("PAUSED")).toEqual({
      label: "Pausada",
      variant: "warning",
    });
    expect(getListingStatusMeta("CLOSED")).toEqual({
      label: "Cerrada",
      variant: "secondary",
    });
    expect(getListingStatusMeta("ERROR")).toEqual({
      label: "Requiere revisión",
      variant: "destructive",
    });
    expect(getListingStatusMeta("UNLINKED")).toEqual({
      label: "Sin vínculo",
      variant: "warning",
    });
  });

  it("does not expose an unknown raw status", () => {
    expect(getListingStatusMeta("UNKNOWN_STATUS")).toEqual({
      label: "Estado pendiente de revisión",
      variant: "secondary",
    });
  });
});
