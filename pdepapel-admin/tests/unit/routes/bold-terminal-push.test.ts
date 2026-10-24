import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/bold-terminal", () => ({ pushToBoldDatafono: mocks.push }));
vi.mock("@/lib/prismadb", () => ({ default: { order: { findUnique: mocks.findUnique }, paymentDetails: { update: mocks.update } } }));
vi.mock("@/lib/utils", () => ({ CACHE_HEADERS: { NO_CACHE: {} }, verifyStoreOwner: mocks.verifyStoreOwner }));

import { POST } from "@/app/api/[storeId]/bold/terminal/[orderId]/route";
import { BOLD_TERMINAL_MARKER } from "@/lib/gateway-fees";

const params = { params: { storeId: "store-1", orderId: "order-1" } };
const request = () => new Request("https://admin.test/api/store-1/bold/terminal/order-1", { method: "POST", body: JSON.stringify({ terminalId: "T1" }) });
const pending = (details: string | null) => ({ id: "order-1", orderNumber: "ORD-1", status: "PENDING", total: 50000, email: null, payment: { method: "Bold", details } });

describe("POST /api/[storeId]/bold/terminal/[orderId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
  });

  it("marca el pago como cobro en datáfono cuando Bold recibe el cobro, para que su comisión no se cuente como en línea", async () => {
    mocks.findUnique.mockResolvedValue(pending("Pago en línea"));
    mocks.push.mockResolvedValue({ success: true, message: "ok", data: {} });
    expect((await POST(request(), params)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { orderId: "order-1" }, data: { details: `Pago en línea · ${BOLD_TERMINAL_MARKER}` } });
  });

  it("el panel manda el POST sin cuerpo: cobra con el datáfono por defecto; un cuerpo roto da 400 sin llamar a Bold", async () => {
    mocks.findUnique.mockResolvedValue(pending(null));
    mocks.push.mockResolvedValue({ success: true, message: "ok", data: {} });
    const empty = new Request("https://admin.test/api/store-1/bold/terminal/order-1", { method: "POST" });
    expect((await POST(empty, params)).status).toBe(200);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    mocks.push.mockClear();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = await POST(new Request("https://admin.test/api/store-1/bold/terminal/order-1", { method: "POST", body: "{" }), params);
    warn.mockRestore();
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({ error: "El cuerpo de la solicitud no es JSON válido" });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("no marca nada si el datáfono no recibió el cobro, ni la repite si ya estaba", async () => {
    mocks.findUnique.mockResolvedValue(pending(null));
    mocks.push.mockResolvedValue({ success: false, message: "Terminal sin conexión" });
    expect((await POST(request(), params)).status).toBe(400);
    mocks.findUnique.mockResolvedValue(pending(`x · ${BOLD_TERMINAL_MARKER}`));
    mocks.push.mockResolvedValue({ success: true, message: "ok", data: {} });
    expect((await POST(request(), params)).status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
