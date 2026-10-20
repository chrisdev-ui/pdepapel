import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NEWSLETTER_EARLY_ACCESS_SECRET: undefined } }));

import { createEarlyAccessToken } from "@/lib/early-access";
import { createCapsulePreviewToken, isCapsulePreviewConfigured, verifyCapsulePreviewToken } from "@/lib/capsule-preview";

const SECRET = "secreto-de-pruebas-0123456789";
const now = new Date("2026-10-22T15:00:00Z");
const ids = { storeId: "s1", editionId: "e1" };

describe("enlace de vista previa de una edición", () => {
  it("abre solo su edición de su tienda, y solo hasta que vence", () => {
    const { token, expiresAt } = createCapsulePreviewToken(ids, now, SECRET);
    expect(expiresAt.toISOString()).toBe("2026-11-05T15:00:00.000Z");
    expect(verifyCapsulePreviewToken(ids, token, now, SECRET)).toBe(true);
    expect(verifyCapsulePreviewToken({ ...ids, editionId: "e2" }, token, now, SECRET)).toBe(false);
    expect(verifyCapsulePreviewToken({ ...ids, storeId: "s2" }, token, now, SECRET)).toBe(false);
    expect(verifyCapsulePreviewToken(ids, token, new Date("2026-11-06T00:00:00Z"), SECRET)).toBe(false);
  });

  it("no acepta firmas cambiadas, otro secreto ni un token de acceso anticipado", () => {
    const { token } = createCapsulePreviewToken(ids, now, SECRET);
    const [body] = token.split(".");
    expect(verifyCapsulePreviewToken(ids, `${body}.xx`, now, SECRET)).toBe(false);
    expect(verifyCapsulePreviewToken(ids, token, now, "otro-secreto-0123456789")).toBe(false);
    const early = createEarlyAccessToken({ storeId: "s1", homeContentId: "e1", exp: Math.floor(now.getTime() / 1000) + 3600 }, SECRET);
    expect(verifyCapsulePreviewToken(ids, early, now, SECRET)).toBe(false);
    expect(verifyCapsulePreviewToken(ids, null, now, SECRET)).toBe(false);
  });

  it("sin secreto no hay vista previa", () => {
    expect(isCapsulePreviewConfigured(undefined)).toBe(false);
    expect(() => createCapsulePreviewToken(ids, now, undefined)).toThrow();
    expect(verifyCapsulePreviewToken(ids, "a.b", now, undefined)).toBe(false);
  });
});
