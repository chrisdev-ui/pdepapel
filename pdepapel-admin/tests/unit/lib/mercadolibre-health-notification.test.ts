import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { ADMIN_WEB_URL: "https://admin.example.com", NODE_ENV: "production" },
  send: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));

import type { MercadoLibreHealthSummary } from "@/lib/mercadolibre/health";
import {
  MAX_ITEMS_PER_GROUP,
  buildMercadoLibreHealthDigest,
  renderMercadoLibreHealthDigestText,
  sendMercadoLibreHealthNotification,
} from "@/lib/mercadolibre/health-notification";

const summary: MercadoLibreHealthSummary = {
  totalListings: 15,
  activeListings: 12,
  unansweredQuestions: 1,
  shipmentsToDispatch: 1,
  claimsRequiringAttention: 0,
  grossSales: 0,
  netSales: 0,
  marketplaceCosts: 0,
  netProfit: 0,
  issues: [
    {
      kind: "stock_risk",
      title: "Termo Owala Negro",
      detail: "Stock local 0; el colchón de seguridad es 0.",
      listingId: "listing-1",
      productId: "product-1",
      permalink: "https://articulo.mercadolibre.com.co/MCO-1",
    },
    {
      kind: "listing_incomplete",
      title: "Estuche Marcadores",
      detail: "Falta categoría, precio o al menos una foto para publicar correctamente.",
      listingId: "listing-2",
      productId: "product-2",
      permalink: null,
    },
    {
      kind: "shipment",
      title: "Envío 4400",
      detail: "Pedido 2000 listo para despachar.",
      orderId: "order-1",
    },
    {
      kind: "question",
      title: "Cuaderno A5",
      detail: "¿Tienen más colores?",
      listingId: "listing-3",
    },
  ],
};

describe("buildMercadoLibreHealthDigest", () => {
  it("orders groups by urgency and attaches a direct action to every case", () => {
    const digest = buildMercadoLibreHealthDigest({
      storeId: "store-1",
      summary,
      now: new Date("2026-09-06T15:57:00.000Z"),
    });

    expect(digest.subject).toBe("[Mercado Libre] 4 revisiones pendientes");
    expect(digest.generatedAt).toContain("6 de septiembre de 2026");
    expect(digest.dashboardUrl).toBe("https://admin.example.com/store-1/mercadolibre");
    expect(digest.metrics).toEqual({
      unansweredQuestions: 1,
      shipmentsToDispatch: 1,
      claimsRequiringAttention: 0,
      activeListings: 12,
      totalListings: 15,
    });
    expect(digest.groups.map((group) => group.kind)).toEqual([
      "shipment",
      "question",
      "listing_incomplete",
      "stock_risk",
    ]);

    const stock = digest.groups.find((group) => group.kind === "stock_risk")!;
    expect(stock.items[0].actions).toEqual([
      {
        label: "Ajustar stock",
        href: "https://admin.example.com/store-1/productos/product-1",
        primary: true,
      },
      {
        label: "Ver publicación",
        href: "https://admin.example.com/store-1/mercadolibre?listing=listing-1#mercadolibre-listing-listing-1",
      },
      {
        label: "Ver en Mercado Libre",
        href: "https://articulo.mercadolibre.com.co/MCO-1",
      },
    ]);
    expect(
      digest.groups.find((group) => group.kind === "listing_incomplete")!.items[0]
        .actions,
    ).toEqual([
      {
        label: "Completar publicación",
        href: "https://admin.example.com/store-1/mercadolibre?listing=listing-2#mercadolibre-listing-listing-2",
        primary: true,
      },
    ]);
    expect(
      digest.groups.find((group) => group.kind === "shipment")!.items[0].actions,
    ).toEqual([
      {
        label: "Ver venta",
        href: "https://admin.example.com/store-1/mercadolibre?order=order-1#mercadolibre-orders",
        primary: true,
      },
    ]);
    expect(
      digest.groups.find((group) => group.kind === "question")!.items[0].actions[0],
    ).toEqual({
      label: "Responder",
      href: "https://admin.example.com/store-1/mercadolibre#mercadolibre-operations",
      primary: true,
    });
    expect(digest.hiddenIssues).toBe(0);
  });

  it("caps each group and counts what was left for the dashboard", () => {
    const many = Array.from({ length: MAX_ITEMS_PER_GROUP + 3 }, (_, index) => ({
      kind: "stock_risk" as const,
      title: `Producto ${index}`,
      detail: "Stock local 0; el colchón de seguridad es 0.",
      listingId: `listing-${index}`,
      productId: `product-${index}`,
    }));
    const digest = buildMercadoLibreHealthDigest({
      storeId: "store-1",
      summary: { ...summary, issues: many },
    });

    expect(digest.subject).toBe(`[Mercado Libre] ${many.length} revisiones pendientes`);
    expect(digest.groups).toHaveLength(1);
    expect(digest.groups[0].items).toHaveLength(MAX_ITEMS_PER_GROUP);
    expect(digest.groups[0].hidden).toBe(3);
    expect(digest.hiddenIssues).toBe(3);
  });

  it("uses singular wording for one issue and renders a grouped plain-text version", () => {
    const digest = buildMercadoLibreHealthDigest({
      storeId: "store-1",
      summary: { ...summary, issues: [summary.issues[0]] },
    });
    const text = renderMercadoLibreHealthDigestText(digest);

    expect(digest.subject).toBe("[Mercado Libre] 1 revisión pendiente");
    expect(text).toContain("No es una venta nueva.");
    expect(text).toContain("## Stock en riesgo (1)");
    expect(text).toContain("- Termo Owala Negro: Stock local 0; el colchón de seguridad es 0.");
    expect(text).toContain("  Ajustar stock: https://admin.example.com/store-1/productos/product-1");
    expect(text).toContain(
      "Abrir Mercado Libre en Administración: https://admin.example.com/store-1/mercadolibre",
    );
  });
});

describe("sendMercadoLibreHealthNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.NODE_ENV = "production";
    mocks.send.mockResolvedValue({ error: null });
  });

  it("sends the grouped digest once per day with an HTML and a text body", async () => {
    await sendMercadoLibreHealthNotification({ storeId: "store-1", summary });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const payload = mocks.send.mock.calls[0][0];
    expect(payload.subject).toBe("[Mercado Libre] 4 revisiones pendientes");
    expect(payload.headers["Idempotency-Key"]).toMatch(
      /^mercadolibre-health-store-1-\d{4}-\d{2}-\d{2}$/,
    );
    expect(payload.react).toBeTruthy();
    expect(payload.text).toContain("## Envíos por despachar (1)");
    expect(payload.text).toContain("## Stock en riesgo (1)");
  });

  it("stays silent when there is nothing to review or in development", async () => {
    await sendMercadoLibreHealthNotification({
      storeId: "store-1",
      summary: { ...summary, issues: [] },
    });
    mocks.env.NODE_ENV = "development";
    await sendMercadoLibreHealthNotification({ storeId: "store-1", summary });

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("surfaces a Resend rejection", async () => {
    mocks.send.mockResolvedValue({ error: { message: "quota" } });

    await expect(
      sendMercadoLibreHealthNotification({ storeId: "store-1", summary }),
    ).rejects.toThrow("Resend rechazó la alerta de Mercado Libre: quota");
  });

  it("puts inventory exceptions first and gives the new operational kinds a direct action", () => {
    const digest = buildMercadoLibreHealthDigest({
      storeId: "store-1",
      summary: {
        ...summary,
        issues: [
          { kind: "settlement_pending", title: "Venta 2001 sin liquidación", detail: "Pagada hace 9 días", orderId: "mo-2" },
          { kind: "outbox_failed", title: "Libreta · stock sin sincronizar", detail: "422 from ML", listingId: "listing-9" },
          { kind: "webhook_failed", title: "2 avisos de Mercado Libre sin procesar", detail: "Ejecuta la recuperación" },
          { kind: "inventory_exception", title: "Venta 2000 sin inventario aplicado", detail: "Stock insuficiente", orderId: "mo-1", externalOrderId: "2000" },
        ],
      },
      now: new Date("2026-09-06T15:57:00.000Z"),
    });
    expect(digest.groups.map((group) => group.kind)).toEqual(["inventory_exception", "outbox_failed", "webhook_failed", "settlement_pending"]);
    expect(digest.groups[0].items[0].actions[0]).toMatchObject({ label: "Reprocesar venta", primary: true });
    expect(digest.groups[1].items[0].actions.map((action) => action.label)).toEqual(["Ver publicación", "Recuperar cola"]);
    expect(digest.groups[2].items[0].actions[0]).toMatchObject({ label: "Recuperar cola", primary: true });
    expect(digest.groups[3].items[0].actions.map((action) => action.label)).toEqual(["Ver flujo de caja", "Ver venta"]);
  });
});
