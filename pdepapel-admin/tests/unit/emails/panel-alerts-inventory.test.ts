import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), issues: vi.fn(), reservations: vi.fn() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: async () => ["panel@example.com"] }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
// Fuera de producción no se toma la pausa en Redis: cada aviso sale.
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({ NODE_ENV: "test" } as Record<string, unknown>, { get: (target, key: string) => (key in target ? target[key] : process.env[key]) }) }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    orderInventoryIssue: { findMany: mocks.issues },
    stockReservation: { findMany: mocks.reservations },
  },
}));

import { notifyStockShortfall, notifyUnbackedReservations } from "@/lib/stock-review-alerts";
import { sendDailyDigest } from "@/lib/stock-reservations-job";

import { expectPanelEmail } from "../../helpers/panel-email";

/** Los avisos de inventario y reservas salen con la plantilla del panel y su texto plano. */
beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ data: { id: "email" }, error: null });
  mocks.issues.mockReset();
  mocks.reservations.mockReset();
});

const row = (customerName: string, product: string, orderNumber?: string) => ({
  customerName,
  expiresAt: new Date("2026-10-21T15:00:00Z"),
  quantity: 1,
  product: { name: product },
  items: [],
  order: orderNumber ? { orderNumber } : null,
});

describe("avisos de inventario con plantilla", () => {
  it("pedido pagado sin stock: lo que falta y el botón al pedido", async () => {
    mocks.issues.mockResolvedValue([{ orderNumber: "ORD-7", productName: "Libreta A5", quantity: 2 }]);
    expect(await notifyStockShortfall("store-1", "order-7", [0])).toBe(true);
    const sent = mocks.send.mock.calls[0][0];
    const html = await expectPanelEmail(sent, { label: "Panel · Inventario", title: "Pedido pagado sin stock", text: /Libreta A5: faltan 2/ });
    expect(html).toContain("Libreta A5: faltan 2");
    expect(html).toContain("/store-1/pedidos/order-7");
  });

  it("reservas sin respaldo: cuáles y el botón a Reservas", async () => {
    mocks.reservations.mockResolvedValue([{ id: "r1", storeId: "store-1", customerName: "Ana", items: [{ quantity: 1, product: { name: "Stickers" } }] }]);
    expect(await notifyUnbackedReservations(["r1"], [0])).toBe(true);
    const sent = mocks.send.mock.calls[0][0];
    const html = await expectPanelEmail(sent, { label: "Panel · Reservas", title: "Una reserva quedó sin respaldo", text: /Stickers × 1 \(reserva de Ana\)/ });
    expect(html).toContain("/store-1/reservas");
  });

  it("resumen diario de reservas: una sección por grupo", async () => {
    mocks.reservations
      .mockResolvedValueOnce([row("Ana", "Libreta")])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row("Luisa", "Agenda")])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    expect(await sendDailyDigest("store-1", new Date("2026-10-21T13:00:00Z"))).toBe(true);
    const sent = mocks.send.mock.calls[0][0];
    const html = await expectPanelEmail(sent, { label: "Panel · Reservas", title: "Resumen de reservas del", text: /Vencen hoy \(1\):\n• Libreta × 1 — Ana/ });
    expect(html).toContain("Vencen hoy (1)");
    expect(html).toContain("Libreta × 1 — Ana");
  });
});
