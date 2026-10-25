import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  confirm: vi.fn(),
  request: vi.fn(),
  screen: vi.fn(),
  storeFind: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("@/lib/newsletter", async () => {
  const { z } = await import("zod");
  return {
    checkNewsletterConfirmationToken: mocks.check,
    confirmNewsletterSubscription: mocks.confirm,
    requestNewsletterSubscription: mocks.request,
    newsletterTokenSchema: z.object({ token: z.string().min(32).max(200) }),
    newsletterSubscriptionSchema: z.object({
      email: z.string().trim().email(),
      consent: z.literal(true),
      source: z.string().optional(),
      productId: z.string().optional(),
      company: z.string().max(0).optional(),
    }),
  };
});
vi.mock("@/lib/newsletter-intake", async () => {
  const actual = await vi.importActual<typeof import("@/lib/newsletter-intake")>("@/lib/newsletter-intake");
  return { ...actual, screenNewsletterSignup: mocks.screen };
});
vi.mock("@/lib/prismadb", () => ({
  default: { store: { findUnique: mocks.storeFind }, product: { findFirst: vi.fn() } },
}));

import { GET as confirmGet, POST as confirmPost } from "@/app/api/[storeId]/newsletter/confirm/route";
import { POST as subscribe } from "@/app/api/[storeId]/newsletter/subscriptions/route";

const TOKEN = "t".repeat(43);
const params = { params: { storeId: "store-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.check.mockResolvedValue({ status: "valid" });
  mocks.confirm.mockResolvedValue({ status: "confirmed" });
  mocks.screen.mockResolvedValue({ action: "accept" });
  mocks.storeFind.mockResolvedValue({ id: "store-1" });
  mocks.request.mockResolvedValue({ accepted: true, confirmationSent: true });
});

describe("confirmación del boletín", () => {
  it("GET solo revisa el token: un escáner de enlaces no confirma", async () => {
    const response = await confirmGet(new Request(`https://admin.test/api/store-1/newsletter/confirm?token=${TOKEN}`), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "valid" });
    expect(mocks.check).toHaveBeenCalledWith("store-1", TOKEN);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("POST con el token confirma", async () => {
    const response = await confirmPost(
      new Request("https://admin.test/api/store-1/newsletter/confirm", { method: "POST", body: JSON.stringify({ token: TOKEN }), headers: { "content-type": "application/json" } }),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "confirmed" });
    expect(mocks.confirm).toHaveBeenCalledWith("store-1", TOKEN);
  });

  it("POST con el token solo en la URL no confirma", async () => {
    const response = await confirmPost(new Request(`https://admin.test/api/store-1/newsletter/confirm?token=${TOKEN}`, { method: "POST" }), params);
    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("deja que la tienda llame con POST", async () => {
    const { OPTIONS } = await import("@/app/api/[storeId]/newsletter/confirm/route");
    const response = await OPTIONS(new Request("https://admin.test/x", { method: "OPTIONS", headers: { origin: "https://papeleriapdepapel.com" } }));
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("alta al boletín desde la tienda", () => {
  const post = (body: Record<string, unknown>) =>
    subscribe(
      new Request("https://admin.test/api/store-1/newsletter/subscriptions", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      params,
    );
  const valid = { email: "cliente@example.com", consent: true, formStartedAt: 1 };

  it("un alta normal responde 202 y pide la confirmación", async () => {
    const response = await post(valid);
    expect(response.status).toBe(202);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["la trampa llena", { action: "drop", reason: "honeypot" }],
    ["un envío rápido", { action: "drop", reason: "too_fast" }],
    ["el límite por IP", { action: "drop", reason: "rate_ip" }],
    ["el límite por correo", { action: "drop", reason: "rate_email" }],
  ])("%s responde igual que un alta real y no guarda ni envía nada", async (_label, screen) => {
    const real = await (await post(valid)).json();
    mocks.request.mockClear();
    mocks.screen.mockResolvedValueOnce(screen);
    const response = await post(valid);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(real);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("la trampa `website` llena se descarta antes de validar", async () => {
    const response = await post({ ...valid, website: "spam" });
    expect(response.status).toBe(202);
    expect(mocks.screen).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("el filtro nunca responde 400 por Turnstile: un alta aceptada sigue al registro", async () => {
    mocks.screen.mockResolvedValueOnce({ action: "accept" });
    const response = await post(valid);
    expect(response.status).toBe(202);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("pasa al filtro la trampa, el reloj y el token", async () => {
    await post({ ...valid, turnstileToken: "tok", website: "" });
    expect(mocks.screen).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ storeId: "store-1", email: "cliente@example.com", formStartedAt: 1, turnstileToken: "tok", website: "" }));
  });
});
