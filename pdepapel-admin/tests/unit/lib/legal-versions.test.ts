import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { orderLegalConsentData } from "@/lib/legal-consent";
import { KNOWN_LEGAL_VERSIONS, LEGAL_VERSIONS, parseLegalVersions } from "@/lib/legal-versions";

const repo = path.resolve(__dirname, "../../../..");

describe("versiones legales: copia de la tienda", () => {
  it("la versión vigente de la tienda es la primera conocida de la administración", () => {
    const store = readFileSync(path.join(repo, "pdepapel-store/lib/legal-versions.ts"), "utf8");
    const terms = /terms:\s*"(\d{4}-\d{2}-\d{2})"/.exec(store)?.[1];
    const privacy = /privacy:\s*"(\d{4}-\d{2}-\d{2})"/.exec(store)?.[1];
    expect(terms).toBe(LEGAL_VERSIONS.terms);
    expect(KNOWN_LEGAL_VERSIONS.terms[0]).toBe(terms);
    expect(privacy).toBe(LEGAL_VERSIONS.privacy);
    expect(KNOWN_LEGAL_VERSIONS.privacy[0]).toBe(privacy);
  });

  it("los términos 2026-10-28 (preventas y anticipos) son los vigentes y los 2026-10-21 se siguen aceptando", () => {
    expect(LEGAL_VERSIONS.terms).toBe("2026-10-28");
    expect(KNOWN_LEGAL_VERSIONS.terms).toEqual(["2026-10-28", "2026-10-21"]);
    expect(parseLegalVersions({ terms: "2026-10-28", privacy: "2026-10-26" })).toEqual({ terms: "2026-10-28", privacy: "2026-10-26" });
    expect(parseLegalVersions({ terms: "2026-10-21", privacy: "2026-10-26" })).toEqual({ terms: "2026-10-21", privacy: "2026-10-26" });
  });

  it("la política 2026-10-26 es la vigente y la anterior se sigue aceptando (la tienda puede llegar después)", () => {
    expect(LEGAL_VERSIONS.privacy).toBe("2026-10-26");
    expect(parseLegalVersions({ terms: "2026-10-21", privacy: "2026-10-21" })).toEqual({ terms: "2026-10-21", privacy: "2026-10-21" });
    expect(parseLegalVersions({ terms: "2026-10-21", privacy: "2026-10-26" })).toEqual({ terms: "2026-10-21", privacy: "2026-10-26" });
    expect(orderLegalConsentData({ isStoreOwner: false, legalConsent: { terms: "2026-10-21", privacy: "2026-10-26" }, now: new Date("2026-10-26T15:00:00Z") })).toMatchObject({
      legalPrivacyVersion: "2026-10-26",
    });
  });

  it("solo acepta pares conocidos", () => {
    expect(parseLegalVersions({ terms: "2026-10-21", privacy: "2026-10-21" })).toEqual({ terms: "2026-10-21", privacy: "2026-10-21" });
    for (const value of [null, "2026-10-21", {}, { terms: "2026-10-21" }, { terms: "2099-01-01", privacy: "2026-10-21" }, { terms: 1, privacy: 2 }]) {
      expect(parseLegalVersions(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("consentimiento del pedido", () => {
  const now = new Date("2026-10-22T15:00:00Z");

  it("la tienda con versiones conocidas guarda; la dueña o sin versiones, nada", () => {
    expect(orderLegalConsentData({ isStoreOwner: false, legalConsent: { terms: "2026-10-21", privacy: "2026-10-21" }, now })).toEqual({
      legalTermsVersion: "2026-10-21",
      legalPrivacyVersion: "2026-10-21",
      legalConsentAt: now,
      legalConsentChannel: "CHECKOUT",
    });
    expect(orderLegalConsentData({ isStoreOwner: true, legalConsent: { terms: "2026-10-21", privacy: "2026-10-21" }, now })).toEqual({});
    expect(orderLegalConsentData({ isStoreOwner: false, legalConsent: undefined, now })).toEqual({});
  });

  it("solo los tres caminos del checkout de la tienda escriben el consentimiento (panel, punto de venta, feria, apartados y WhatsApp no)", () => {
    const files = execFileSync("git", ["grep", "--untracked", "-l", "orderLegalConsentData", "--", "app", "lib"], { cwd: path.join(repo, "pdepapel-admin"), encoding: "utf8" })
      .trim()
      .split("\n")
      .sort();
    expect(files).toEqual(["app/api/[storeId]/checkout/route.ts", "app/api/[storeId]/gift-cards/checkout/route.ts", "app/api/[storeId]/orders/route.ts", "lib/legal-consent.ts"]);
    for (const file of ["lib/point-of-sale.ts", "lib/fair-events.ts", "lib/stock-reservations.ts", "lib/whatsapp/cart-orders.ts"]) {
      expect(readFileSync(path.join(repo, "pdepapel-admin", file), "utf8"), file).not.toMatch(/legalConsent|legalTermsVersion/);
    }
  });
});
