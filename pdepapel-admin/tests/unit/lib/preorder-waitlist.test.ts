import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  turnstile: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, consumeRateLimit: mocks.consume };
});
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.turnstile }));
vi.mock("@/lib/prismadb", () => ({
  default: { preorderWaitlistEntry: { findFirst: mocks.findFirst, create: mocks.create }, productPresale: { findFirst: vi.fn() } },
}));

import {
  countWaitlistByStatus,
  createOrReuseWaitlistEntry,
  screenWaitlistSignup,
  waitlistContactKeys,
  waitlistDuplicateWhere,
} from "@/lib/preorder-waitlist";
import {
  panelWaitlistEntrySchema,
  publicWaitlistSignupSchema,
  splitWaitlistContact,
  waitlistStatusPatchSchema,
  waitlistWhatsappLink,
} from "@/lib/preorder-waitlist-shared";
import { scrubWaitlistEntries, scrubWaitlistEntry } from "@/lib/viewer-payloads";

const PHONE = "+573001112233";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  mocks.turnstile.mockResolvedValue({ ok: true });
});

describe("alta desde el panel", () => {
  const base = { productId: "p1", name: "Ana", channel: "WHATSAPP" };

  it("exige al menos un contacto: teléfono, @usuario o correo", () => {
    expect(panelWaitlistEntrySchema.safeParse(base).success).toBe(false);
    expect(panelWaitlistEntrySchema.safeParse({ ...base, phone: "3001112233" }).success).toBe(true);
    expect(panelWaitlistEntrySchema.safeParse({ ...base, handle: "@ana.kawaii" }).success).toBe(true);
    expect(panelWaitlistEntrySchema.safeParse({ ...base, email: "ana@example.com" }).success).toBe(true);
  });

  it("normaliza el teléfono a E.164 y quita la @ del usuario", () => {
    expect(panelWaitlistEntrySchema.parse({ ...base, phone: "300 111 2233" }).phone).toBe(PHONE);
    expect(panelWaitlistEntrySchema.parse({ ...base, handle: "@ana.kawaii" }).handle).toBe("ana.kawaii");
    expect(panelWaitlistEntrySchema.parse({ ...base, email: " Ana@Example.com " }).email).toBe("ana@example.com");
  });

  it("rechaza un teléfono que no es número y un canal fuera de la lista (WEB solo lo pone la tienda)", () => {
    expect(panelWaitlistEntrySchema.safeParse({ ...base, phone: "12" }).success).toBe(false);
    expect(panelWaitlistEntrySchema.safeParse({ ...base, channel: "WEB", phone: PHONE }).success).toBe(false);
    expect(panelWaitlistEntrySchema.safeParse({ ...base, channel: "FAX", phone: PHONE }).success).toBe(false);
  });

  it("el campo único del panel separa teléfono de @usuario", () => {
    expect(splitWaitlistContact("300 111 2233")).toEqual({ phone: "300 111 2233" });
    expect(splitWaitlistContact("@ana")).toEqual({ handle: "@ana" });
    expect(splitWaitlistContact("ana_kawaii")).toEqual({ handle: "ana_kawaii" });
    expect(splitWaitlistContact("  ")).toEqual({});
  });

  it("el enlace de WhatsApp lleva solo los dígitos", () => {
    expect(waitlistWhatsappLink(PHONE)).toBe("https://wa.me/573001112233");
  });
});

describe("cambio de estado a mano", () => {
  it.each(["WAITING", "CONTACTED", "DISCARDED"])("acepta %s", (status) => {
    expect(waitlistStatusPatchSchema.safeParse({ status }).success).toBe(true);
  });

  it("nunca acepta CONVERTED: eso lo pone «Marcar anticipo recibido»", () => {
    expect(waitlistStatusPatchSchema.safeParse({ status: "CONVERTED" }).success).toBe(false);
  });
});

describe("alta desde la tienda", () => {
  const base = {
    productId: "p1",
    name: "Ana",
    consentText: "Acepto que P de Papel me contacte por WhatsApp o correo solo sobre esta preventa.",
    consentVersion: "2026-10-26",
  };

  it("pide WhatsApp o correo y no acepta @usuario", () => {
    expect(publicWaitlistSignupSchema.safeParse(base).success).toBe(false);
    expect(publicWaitlistSignupSchema.safeParse({ ...base, phone: PHONE }).success).toBe(true);
    expect(publicWaitlistSignupSchema.safeParse({ ...base, email: "ana@example.com" }).success).toBe(true);
    expect(publicWaitlistSignupSchema.parse({ ...base, phone: PHONE, handle: "ana" })).not.toHaveProperty("handle");
  });

  it("exige el consentimiento con una versión de privacidad conocida", () => {
    expect(publicWaitlistSignupSchema.safeParse({ ...base, phone: PHONE, consentText: "" }).success).toBe(false);
    expect(publicWaitlistSignupSchema.safeParse({ ...base, phone: PHONE, consentVersion: "2020-01-01" }).success).toBe(false);
    const { consentVersion: _omit, ...withoutVersion } = base;
    expect(publicWaitlistSignupSchema.safeParse({ ...withoutVersion, phone: PHONE }).success).toBe(false);
  });
});

describe("duplicados", () => {
  it("busca por teléfono o correo en el mismo producto y tienda, sin contar descartadas", () => {
    expect(waitlistDuplicateWhere({ storeId: "s", productId: "p", phone: PHONE, email: "a@example.com" })).toEqual({
      storeId: "s",
      productId: "p",
      status: { not: "DISCARDED" },
      OR: [{ phone: PHONE }, { email: "a@example.com" }],
    });
    expect(waitlistDuplicateWhere({ storeId: "s", productId: "p", phone: null, email: null })).toBeNull();
  });

  const input = {
    storeId: "s",
    productId: "p",
    presaleId: null,
    name: "Ana",
    phone: PHONE,
    handle: null,
    email: null,
    channel: "WHATSAPP" as const,
    note: null,
    createdBy: "user_1",
  };

  it("devuelve la entrada que ya existe en vez de crear otra", async () => {
    mocks.findFirst.mockResolvedValue({ id: "e1" });
    const result = await createOrReuseWaitlistEntry(input);
    expect(result).toEqual({ entry: { id: "e1" }, created: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("crea cuando no hay otra con ese contacto", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "e2" });
    const result = await createOrReuseWaitlistEntry(input);
    expect(result.created).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ storeId: "s", phone: PHONE, createdBy: "user_1" }) });
  });

  it("solo un @usuario no se deduplica (no es teléfono ni correo)", async () => {
    mocks.create.mockResolvedValue({ id: "e3" });
    await createOrReuseWaitlistEntry({ ...input, phone: null, handle: "ana" });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalled();
  });
});

describe("conteos", () => {
  it("rellena con cero los estados que no aparecen", () => {
    expect(countWaitlistByStatus([{ status: "WAITING", _count: { _all: 3 } }, { status: "CONVERTED", _count: { _all: 1 } }] as never)).toEqual({
      WAITING: 3,
      CONTACTED: 0,
      CONVERTED: 1,
      DISCARDED: 0,
    });
  });
});

describe("cuenta de solo lectura", () => {
  const row = {
    id: "e1",
    status: "WAITING",
    channel: "WEB",
    name: "Ana",
    phone: PHONE,
    email: "ana@example.com",
    handle: "ana",
    note: "quiere dos",
    consentText: "Acepto",
    consentVersion: "2026-10-26",
    createdBy: "WEB",
    createdAt: "2026-10-28T00:00:00.000Z",
  };

  it("quita contacto, nota, nombre y prueba de consentimiento; deja estado, canal y fecha", () => {
    const clean = scrubWaitlistEntry(row);
    for (const key of ["name", "phone", "email", "handle", "note", "consentText", "consentVersion", "createdBy"]) {
      expect(clean).not.toHaveProperty(key);
    }
    expect(clean).toEqual({ id: "e1", status: "WAITING", channel: "WEB", createdAt: "2026-10-28T00:00:00.000Z" });
    expect(scrubWaitlistEntries([row])[0]).toEqual(clean);
  });
});

describe("filtro del alta desde la tienda", () => {
  const request = () => new Request("https://admin.test/x", { headers: { "x-forwarded-for": "198.51.100.7" } });
  const now = 100_000;
  const input = { storeId: "s", productId: "p", phone: PHONE, email: "ana@example.com", formStartedAt: now - 5_000 };

  it("acepta un alta normal y consume los tres límites con claves propias de la lista", async () => {
    expect(await screenWaitlistSignup(request(), input, now)).toEqual({ action: "accept" });
    const keys = mocks.consume.mock.calls.map(([arg]) => arg.key as string);
    expect(keys.every((key) => key.startsWith("waitlist:s:"))).toBe(true);
    expect(keys.some((key) => key.includes(":ip:"))).toBe(true);
    expect(keys.filter((key) => key.includes(":contact:"))).toHaveLength(2);
    expect(keys.filter((key) => key.includes(":product:"))).toHaveLength(2);
    // Nada de contacto en claro en las claves de Redis.
    expect(keys.join(" ")).not.toMatch(/573001112233|example\.com/);
    expect(mocks.consume).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, windowSeconds: 3600 }));
    expect(mocks.consume).toHaveBeenCalledWith(expect.objectContaining({ limit: 3, windowSeconds: 86400 }));
    expect(mocks.consume).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it("descarta la trampa y un envío de menos de 3 s", async () => {
    expect(await screenWaitlistSignup(request(), { ...input, website: "x" }, now)).toEqual({ action: "drop", reason: "honeypot" });
    expect(await screenWaitlistSignup(request(), { ...input, formStartedAt: now - 1_000 }, now)).toEqual({ action: "drop", reason: "too_fast" });
    expect(await screenWaitlistSignup(request(), { ...input, formStartedAt: undefined }, now)).toEqual({ action: "drop", reason: "too_fast" });
  });

  it("descarta por IP, por contacto y por contacto en el mismo producto", async () => {
    mocks.consume.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    expect(await screenWaitlistSignup(request(), input, now)).toMatchObject({ reason: "rate_ip" });

    mocks.consume.mockImplementation(async ({ key }: { key: string }) => ({ allowed: !key.includes(":contact:"), remaining: 0, retryAfterSeconds: 1 }));
    expect(await screenWaitlistSignup(request(), input, now)).toMatchObject({ reason: "rate_contact" });

    mocks.consume.mockImplementation(async ({ key }: { key: string }) => ({ allowed: !key.includes(":product:"), remaining: 0, retryAfterSeconds: 1 }));
    expect(await screenWaitlistSignup(request(), input, now)).toMatchObject({ reason: "rate_contact_product" });
  });

  it("Turnstile fallido no bloquea", async () => {
    mocks.turnstile.mockResolvedValue({ ok: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await screenWaitlistSignup(request(), input, now)).toEqual({ action: "accept" });
    warn.mockRestore();
  });

  it("las claves de contacto usan el teléfono y el correo como el boletín", () => {
    expect(waitlistContactKeys({ phone: PHONE, email: "a.b+x@googlemail.com" })).toEqual([`p:${PHONE}`, "e:ab@gmail.com"]);
  });
});
