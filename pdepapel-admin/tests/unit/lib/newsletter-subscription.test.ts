import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  send: vi.fn(),
  background: [] as Promise<unknown>[],
}));

vi.mock("@/lib/background", () => ({
  runInBackground: (_label: string, task: () => Promise<unknown>) => {
    mocks.background.push(task());
  },
}));

vi.mock("@/lib/env.mjs", () => ({
  env: { NODE_ENV: "test", FRONTEND_STORE_URL: "https://tienda.test", ADMIN_WEB_URL: "https://admin.test" },
}));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    newsletterSubscriber: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      create: mocks.create,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  CONFIRMATION_COOLDOWN_HOURS,
  checkNewsletterConfirmationToken,
  confirmNewsletterSubscription,
  requestNewsletterSubscription,
  subscribeFromStoreOrder,
} from "@/lib/newsletter";
import { hashNewsletterToken } from "@/lib/newsletter-tokens";

const writes = () => [mocks.create, mocks.update, mocks.updateMany, mocks.transaction, mocks.send].reduce((sum, fn) => sum + fn.mock.calls.length, 0);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ id: "sub-1", email: "maria@gmail.com" });
  mocks.update.mockResolvedValue({ id: "sub-1", email: "maria@gmail.com" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.send.mockResolvedValue({ error: null });
  mocks.transaction.mockResolvedValue({ id: "coupon-1", code: "BIENVENIDA-ABC123", endDate: new Date() });
});

describe("alta al boletín", () => {
  it("una fila nueva de Gmail se guarda sin puntos ni +", async () => {
    await expect(requestNewsletterSubscription({ storeId: "s", email: "Ma.Ria+x@googlemail.com" })).resolves.toEqual({ accepted: true, confirmationSent: true });
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ storeId: "s", emailNormalized: { in: ["maria@gmail.com", "ma.ria+x@googlemail.com"] } });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ storeId: "s", email: "Ma.Ria+x@googlemail.com", emailNormalized: "maria@gmail.com" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("encuentra un activo guardado a la vieja (con puntos) y no crea, no cambia ni envía nada", async () => {
    mocks.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "old", status: "ACTIVE", emailNormalized: "m.a.ria@gmail.com" }, { id: "x", status: "PENDING", emailNormalized: "marta@gmail.com" }]);
    await expect(requestNewsletterSubscription({ storeId: "s", email: "maria@gmail.com" })).resolves.toEqual({ accepted: true, confirmationSent: false });
    expect(mocks.findMany.mock.calls[1][0].where).toMatchObject({ storeId: "s", emailNormalized: { startsWith: "m" } });
    expect(writes()).toBe(0);
  });

  it("un pendiente guardado a la vieja se reutiliza por id, sin tocar su llave", async () => {
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "old", status: "PENDING", emailNormalized: "ma.ria@gmail.com" }]);
    await requestNewsletterSubscription({ storeId: "s", email: "maria@gmail.com" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update.mock.calls[0][0].where).toEqual({ id: "old" });
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("emailNormalized");
  });

  it("otra confirmación a la misma dirección espera 24 h, también si se había dado de baja", async () => {
    expect(CONFIRMATION_COOLDOWN_HOURS).toBe(24);
    vi.useFakeTimers({ now: new Date("2026-10-25T12:00:00Z"), toFake: ["Date"] });
    mocks.findMany.mockResolvedValueOnce([{ id: "sub-1", status: "UNSUBSCRIBED" }]);
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(requestNewsletterSubscription({ storeId: "s", email: "cliente@example.com" })).resolves.toEqual({ accepted: true, confirmationSent: false });
    const claim = mocks.updateMany.mock.calls[0][0].where;
    expect(claim.OR).toEqual([{ lastConfirmationSentAt: null }, { lastConfirmationSentAt: { lte: new Date("2026-10-24T12:00:00Z") } }]);
    expect(mocks.send).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("enlace de confirmación", () => {
  const pending = { id: "sub-1", storeId: "s", email: "a@b.co", status: "PENDING", confirmationExpiresAt: new Date(Date.now() + 3_600_000), welcomeCouponId: null };

  it.each([
    ["valid", pending],
    ["already_confirmed", { ...pending, status: "ACTIVE", confirmationExpiresAt: null }],
    ["expired", { ...pending, confirmationExpiresAt: new Date(Date.now() - 1) }],
    ["invalid", null],
    ["invalid", { ...pending, status: "UNSUBSCRIBED" }],
  ])("revisar el token responde %s y no escribe nada", async (status, row) => {
    mocks.findFirst.mockResolvedValue(row);
    await expect(checkNewsletterConfirmationToken("s", "t".repeat(40))).resolves.toEqual({ status });
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({ storeId: "s", confirmationTokenHash: hashNewsletterToken("t".repeat(40)) });
    expect(writes()).toBe(0);
  });

  it("confirmar activa, emite el cupón y manda la bienvenida; conserva el hash para «ya confirmada»", async () => {
    mocks.findFirst.mockResolvedValue(pending);
    await expect(confirmNewsletterSubscription("s", "t".repeat(40))).resolves.toEqual({ status: "confirmed" });
    const data = mocks.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "ACTIVE", confirmationExpiresAt: null });
    expect(data).not.toHaveProperty("confirmationTokenHash");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ subject: "Tu suscripción a P de Papel está lista" }));
  });

  it("confirmar otra vez no repite cupón ni correo", async () => {
    mocks.findFirst.mockResolvedValue({ ...pending, status: "ACTIVE", confirmationExpiresAt: null });
    await expect(confirmNewsletterSubscription("s", "t".repeat(40))).resolves.toEqual({ status: "already_confirmed" });
    expect(writes()).toBe(0);
  });
});

describe("casilla del boletín en el pago", () => {
  beforeEach(() => {
    mocks.background.length = 0;
  });

  it("con la casilla marcada da de alta desde el panel, con origen /finalizar-compra", async () => {
    expect(subscribeFromStoreOrder({ storeId: "s", email: "ana@correo.co", optIn: true, isStoreOwner: false })).toBe(true);
    await Promise.all(mocks.background);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ storeId: "s", source: "/finalizar-compra" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("sin casilla, con un correo inválido o desde el panel no hace nada", async () => {
    expect(subscribeFromStoreOrder({ storeId: "s", email: "ana@correo.co", optIn: false, isStoreOwner: false })).toBe(false);
    expect(subscribeFromStoreOrder({ storeId: "s", email: "ana@correo.co", optIn: "true", isStoreOwner: false })).toBe(false);
    expect(subscribeFromStoreOrder({ storeId: "s", email: "no-es-correo", optIn: true, isStoreOwner: false })).toBe(false);
    expect(subscribeFromStoreOrder({ storeId: "s", email: "ana@correo.co", optIn: true, isStoreOwner: true })).toBe(false);
    await Promise.all(mocks.background);
    expect(writes()).toBe(0);
  });
});

