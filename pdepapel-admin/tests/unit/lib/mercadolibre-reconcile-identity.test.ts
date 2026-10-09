import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { getAlertIdentity } from "@/lib/mercadolibre/health-alerts";

describe("identidad de las alertas de la revisión diaria", () => {
  const price = { kind: "ml_price_mismatch" as const, title: "Cartuchera", detail: "x", listingId: "l1", fingerprintParts: [45000, 39900] };

  it("la clave es la publicación (o la entidad) y la huella sale de los datos de Mercado Libre", () => {
    const identity = getAlertIdentity(price);
    expect(identity.alertKey).toBe("ml_price_mismatch:l1");
    expect(getAlertIdentity({ ...price, detail: "otro texto" }).fingerprint).toBe(identity.fingerprint);
    expect(getAlertIdentity({ ...price, fingerprintParts: [47000, 39900] }).fingerprint).not.toBe(identity.fingerprint);
  });

  it("el panel reutiliza la huella guardada sin leer Mercado Libre", () => {
    expect(getAlertIdentity({ ...price, fingerprintParts: undefined, fingerprint: "guardada" }).fingerprint).toBe("guardada");
  });

  it("las alertas por entidad y las de la conexión", () => {
    expect(getAlertIdentity({ kind: "ml_unlinked_stock", title: "t", detail: "d", entityId: "MCO8" }).alertKey).toBe("ml_unlinked_stock:MCO8");
    expect(getAlertIdentity({ kind: "ml_twin_mismatch", title: "t", detail: "d", listingId: "l1", entityId: "l1|MCO2" }).alertKey).toBe("ml_twin_mismatch:l1|MCO2");
    expect(getAlertIdentity({ kind: "ml_unchecked", title: "t", detail: "d" }).alertKey).toBe("ml_unchecked");
    expect(getAlertIdentity({ kind: "ml_reauth", title: "t", detail: "d" }).alertKey).toBe("ml_reauth");
  });
});
