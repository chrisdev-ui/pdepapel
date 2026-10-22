import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { formatLegalDate, LEGAL_VERSIONS } from "@/lib/legal-versions";

/** Una sola fuente: la fecha de cada política es su versión, y nada la repite a mano. */
const root = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("versiones legales", () => {
  it("las páginas toman su fecha de LEGAL_VERSIONS, sin fechas escritas a mano", () => {
    const terms = read("app/(routes)/politicas/terminos/page.tsx");
    const privacy = read("app/(routes)/politicas/privacidad/page.tsx");
    expect(terms).toContain("updatedAt={LEGAL_VERSIONS.terms}");
    expect(privacy).toContain("updatedAt={LEGAL_VERSIONS.privacy}");
    expect(privacy).toContain("{formatLegalDate(LEGAL_VERSIONS.privacy)}");
    for (const source of [terms, privacy]) expect(source).not.toMatch(/updatedAt="\d{4}-\d{2}-\d{2}"|\d{1,2} de [a-z]+ de 20\d\d/);
  });

  it("las versiones son fechas válidas y se leen como en las políticas", () => {
    for (const version of Object.values(LEGAL_VERSIONS)) expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatLegalDate("2026-10-21")).toBe("21 de octubre de 2026");
  });

  it("el checkout y la tarjeta de regalo mandan las versiones que mostró la frase", () => {
    expect(read("app/(routes)/finalizar-compra/components/multi-step-checkout-form.tsx")).toContain("legalConsent: legalConsentPayload()");
    expect(read("app/(routes)/tarjeta-regalo/components/gift-card-form.tsx")).toContain("legalConsent: legalConsentPayload()");
  });
});
