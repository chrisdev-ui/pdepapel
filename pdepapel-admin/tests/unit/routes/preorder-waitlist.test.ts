import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys } from "../../helpers/forbidden-keys";

const mocks = vi.hoisted(() => ({
  userId: "user_owner" as string | null,
  role: "owner" as "owner" | "viewer",
  verifyOwner: vi.fn(),
  screen: vi.fn(),
  presaleFind: vi.fn(),
  productFind: vi.fn(),
  entryFindFirst: vi.fn(),
  entryFindMany: vi.fn(),
  entryCreate: vi.fn(),
  entryUpdate: vi.fn(),
  groupBy: vi.fn(),
  resendSend: vi.fn(),
  whatsappText: vi.fn(),
  whatsappTemplate: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@/lib/utils", () => ({ CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: mocks.userId }) }));
vi.mock("@/lib/server/utils", () => ({ verifyStoreOwner: mocks.verifyOwner }));
vi.mock("@/lib/store-access", async () => {
  const { ErrorFactory } = await import("@/lib/api-errors");
  return {
    requireStoreRead: async () => {
      if (!mocks.userId) throw ErrorFactory.Unauthenticated();
      return { userId: mocks.userId, role: mocks.role };
    },
  };
});
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.resendSend }, batch: { send: mocks.resendSend } } }));
vi.mock("@/lib/whatsapp/send", () => ({
  sendWhatsAppTextMessage: mocks.whatsappText,
  sendWhatsAppTemplateMessage: mocks.whatsappTemplate,
}));
vi.mock("@/lib/preorder-waitlist", async () => {
  const actual = await vi.importActual<typeof import("@/lib/preorder-waitlist")>("@/lib/preorder-waitlist");
  return { ...actual, screenWaitlistSignup: mocks.screen };
});
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findFirst: mocks.productFind },
    productPresale: { findFirst: mocks.presaleFind },
    preorderWaitlistEntry: {
      findFirst: mocks.entryFindFirst,
      findMany: mocks.entryFindMany,
      create: mocks.entryCreate,
      update: mocks.entryUpdate,
      groupBy: mocks.groupBy,
    },
  },
}));

import { PATCH } from "@/app/api/[storeId]/preorder-waitlist/[entryId]/route";
import { OPTIONS, POST as PUBLIC_POST } from "@/app/api/[storeId]/preorder-waitlist/public/route";
import { GET, POST } from "@/app/api/[storeId]/preorder-waitlist/route";
import { ErrorFactory } from "@/lib/api-errors";

const PHONE = "+573001112233";
const STORE = { params: { storeId: "store-1" } };
const json = (body: unknown, method = "POST") =>
  new Request("https://admin.test/api/store-1/preorder-waitlist", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: "https://papeleriapdepapel.com" },
  });

const row = {
  id: "e1",
  productId: "p1",
  presaleId: "ps1",
  name: "Ana",
  phone: PHONE,
  handle: null,
  email: "ana@example.com",
  channel: "WEB",
  note: "quiere dos",
  status: "WAITING",
  consentVersion: "2026-10-26",
  orderId: null,
  contactedAt: null,
  createdBy: "WEB",
  createdAt: new Date("2026-10-28T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "user_owner";
  mocks.role = "owner";
  mocks.verifyOwner.mockResolvedValue(undefined);
  mocks.screen.mockResolvedValue({ action: "accept" });
  mocks.presaleFind.mockResolvedValue({ id: "ps1" });
  mocks.productFind.mockResolvedValue({ id: "p1" });
  mocks.entryFindFirst.mockResolvedValue(null);
  mocks.entryFindMany.mockResolvedValue([row]);
  mocks.entryCreate.mockResolvedValue({ id: "new" });
  mocks.entryUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }));
  mocks.groupBy.mockResolvedValue([{ status: "WAITING", _count: { _all: 1 } }]);
});

describe("GET /preorder-waitlist", () => {
  const get = (query = "?productId=p1") => GET(new Request(`https://admin.test/api/store-1/preorder-waitlist${query}`), STORE);

  it("la dueña ve filas completas y conteos, acotados por tienda y producto", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.counts).toEqual({ WAITING: 1, CONTACTED: 0, CONVERTED: 0, DISCARDED: 0 });
    expect(body.entries[0]).toMatchObject({ name: "Ana", phone: PHONE, note: "quiere dos" });
    expect(mocks.entryFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-1", productId: "p1" } }));
  });

  it("la cuenta de solo lectura ve conteos y filas sin nombre, contacto ni nota", async () => {
    mocks.role = "viewer";
    const body = await (await get()).json();
    assertNoForbiddenKeys(body, "viewer");
    for (const key of ["name", "phone", "email", "handle", "note", "consentVersion", "createdBy"]) {
      expect(body.entries[0]).not.toHaveProperty(key);
    }
    expect(body.entries[0]).toMatchObject({ id: "e1", status: "WAITING", channel: "WEB" });
    expect(body.counts.WAITING).toBe(1);
  });

  it("sin sesión responde 401 y sin producto 400", async () => {
    expect((await get("")).status).toBe(400);
    mocks.userId = null;
    expect((await get()).status).toBe(401);
  });
});

describe("POST /preorder-waitlist (panel)", () => {
  const valid = { productId: "p1", name: "Ana", channel: "INSTAGRAM", handle: "@ana.kawaii", note: "rosado" };

  it("sin sesión 401, sin ser dueña 403, y no escribe", async () => {
    mocks.userId = null;
    expect((await POST(json(valid), STORE)).status).toBe(401);
    mocks.userId = "user_stranger";
    mocks.verifyOwner.mockRejectedValueOnce(ErrorFactory.Unauthorized());
    expect((await POST(json(valid), STORE)).status).toBe(403);
    expect(mocks.entryCreate).not.toHaveBeenCalled();
  });

  it("crea con el canal elegido, quien la anotó y la preventa activa resuelta en el servidor", async () => {
    const response = await POST(json({ ...valid, presaleId: "ajena" }), STORE);
    expect(response.status).toBe(201);
    expect(mocks.verifyOwner).toHaveBeenCalledWith("user_owner", "store-1");
    expect(mocks.productFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", storeId: "store-1" } }));
    expect(mocks.entryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ storeId: "store-1", presaleId: "ps1", channel: "INSTAGRAM", handle: "ana.kawaii", createdBy: "user_owner" }),
    });
  });

  it("un teléfono repetido devuelve la entrada existente", async () => {
    mocks.entryFindFirst.mockResolvedValueOnce(row);
    const response = await POST(json({ ...valid, handle: undefined, phone: "3001112233" }), STORE);
    expect(response.status).toBe(200);
    expect((await response.json()).duplicate).toBe(true);
    expect(mocks.entryCreate).not.toHaveBeenCalled();
  });

  it("sin contacto o con un producto de otra tienda no escribe", async () => {
    expect((await POST(json({ ...valid, handle: undefined }), STORE)).status).toBe(400);
    mocks.productFind.mockResolvedValueOnce(null);
    expect((await POST(json(valid), STORE)).status).toBe(404);
    expect(mocks.entryCreate).not.toHaveBeenCalled();
  });
});

describe("PATCH /preorder-waitlist/[entryId]", () => {
  const patch = (status: string) => PATCH(json({ status }, "PATCH"), { params: { storeId: "store-1", entryId: "e1" } });

  it("sin sesión 401 y sin ser dueña 403", async () => {
    mocks.userId = null;
    expect((await patch("CONTACTED")).status).toBe(401);
    mocks.userId = "user_stranger";
    mocks.verifyOwner.mockRejectedValueOnce(ErrorFactory.Unauthorized());
    expect((await patch("CONTACTED")).status).toBe(403);
    expect(mocks.entryUpdate).not.toHaveBeenCalled();
  });

  it("CONTACTED anota la fecha; WAITING la limpia; DISCARDED la deja", async () => {
    mocks.entryFindFirst.mockResolvedValue({ id: "e1", status: "WAITING" });
    await patch("CONTACTED");
    expect(mocks.entryUpdate.mock.calls[0][0].data).toMatchObject({ status: "CONTACTED", contactedAt: expect.any(Date) });
    await patch("WAITING");
    expect(mocks.entryUpdate.mock.calls[1][0].data).toEqual({ status: "WAITING", contactedAt: null });
    await patch("DISCARDED");
    expect(mocks.entryUpdate.mock.calls[2][0].data).toEqual({ status: "DISCARDED" });
    expect(mocks.entryFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "e1", storeId: "store-1" } }));
  });

  it("nunca pone CONVERTED", async () => {
    mocks.entryFindFirst.mockResolvedValue({ id: "e1", status: "WAITING" });
    expect((await patch("CONVERTED")).status).toBe(400);
    expect(mocks.entryUpdate).not.toHaveBeenCalled();
  });

  it("una entrada con anticipo ya no se mueve", async () => {
    mocks.entryFindFirst.mockResolvedValue({ id: "e1", status: "CONVERTED" });
    expect((await patch("WAITING")).status).toBe(409);
    expect(mocks.entryUpdate).not.toHaveBeenCalled();
  });

  it("una entrada de otra tienda responde 404", async () => {
    mocks.entryFindFirst.mockResolvedValue(null);
    expect((await patch("CONTACTED")).status).toBe(404);
  });
});

describe("POST /preorder-waitlist/public (tienda en línea)", () => {
  const valid = {
    productId: "p1",
    name: "Ana",
    phone: PHONE,
    consentText: "Acepto que P de Papel me contacte por WhatsApp o correo solo sobre esta preventa.",
    consentVersion: "2026-10-26",
    formStartedAt: 1,
    website: "",
  };
  const post = (body: unknown) => PUBLIC_POST(json(body), STORE);

  const expectNothingSent = () => {
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(mocks.whatsappText).not.toHaveBeenCalled();
    expect(mocks.whatsappTemplate).not.toHaveBeenCalled();
  };

  it("un alta aceptada responde 202, guarda canal WEB con su consentimiento y no envía nada", async () => {
    const response = await post(valid);
    expect(response.status).toBe(202);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://papeleriapdepapel.com");
    expect(mocks.presaleFind).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-1", productId: "p1", status: "ACTIVE" } }));
    expect(mocks.entryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: "store-1",
        productId: "p1",
        presaleId: "ps1",
        channel: "WEB",
        createdBy: "WEB",
        phone: PHONE,
        consentVersion: "2026-10-26",
        consentText: valid.consentText,
      }),
    });
    expectNothingSent();
  });

  it.each([
    ["la trampa llena", { action: "drop", reason: "honeypot" }],
    ["un envío rápido", { action: "drop", reason: "too_fast" }],
    ["el límite por IP", { action: "drop", reason: "rate_ip" }],
    ["el límite por contacto", { action: "drop", reason: "rate_contact" }],
    ["el límite por contacto y producto", { action: "drop", reason: "rate_contact_product" }],
  ])("%s responde igual que un alta real y no guarda ni envía nada", async (_label, screen) => {
    const real = await (await post(valid)).json();
    mocks.entryCreate.mockClear();
    mocks.screen.mockResolvedValueOnce(screen);
    const response = await post(valid);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(real);
    expect(mocks.entryCreate).not.toHaveBeenCalled();
    expectNothingSent();
  });

  it("la trampa `website` llena se descarta antes del filtro", async () => {
    const real = await (await post(valid)).json();
    vi.clearAllMocks();
    const response = await post({ ...valid, website: "spam" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(real);
    expect(mocks.screen).not.toHaveBeenCalled();
    expect(mocks.entryCreate).not.toHaveBeenCalled();
  });

  it("sin preventa activa en esta tienda responde igual y no guarda", async () => {
    const real = await (await post(valid)).json();
    mocks.entryCreate.mockClear();
    mocks.presaleFind.mockResolvedValueOnce(null);
    const response = await post(valid);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(real);
    expect(mocks.entryCreate).not.toHaveBeenCalled();
    expectNothingSent();
  });

  it("un contacto repetido responde igual y no duplica", async () => {
    mocks.entryFindFirst.mockResolvedValueOnce(row);
    const response = await post(valid);
    expect(response.status).toBe(202);
    expect(mocks.entryCreate).not.toHaveBeenCalled();
  });

  it("sin consentimiento, con una versión desconocida o sin contacto responde 400 sin guardar", async () => {
    expect((await post({ ...valid, consentText: "" })).status).toBe(400);
    expect((await post({ ...valid, consentVersion: "1999-01-01" })).status).toBe(400);
    expect((await post({ ...valid, phone: undefined })).status).toBe(400);
    expect(mocks.screen).not.toHaveBeenCalled();
    expect(mocks.entryCreate).not.toHaveBeenCalled();
  });

  it("un error no deja en el registro el nombre ni el contacto", async () => {
    mocks.entryCreate.mockRejectedValueOnce(new Error("db caída"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post({ ...valid, email: "ana@example.com" });
    expect(response.status).toBe(500);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toMatch(/Ana|573001112233|ana@example\.com/);
    error.mockRestore();
  });

  it("deja que la tienda llame con POST", async () => {
    const response = await OPTIONS(new Request("https://admin.test/x", { method: "OPTIONS", headers: { origin: "https://papeleriapdepapel.com" } }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
