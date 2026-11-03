import { OrderSalesChannel, OrderSource, OrderType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { orderOriginWhere } from "@/lib/order-list";
import { hasActiveListFilters, orderMatchesListFilters, parseOrderListFilters, writeOrderListFilters } from "@/lib/order-list-filters";
import { parseSalesChannel, reportChannelOf, SALES_CHANNELS, salesChannelFromWaitlist } from "@/lib/order-sales-channel";

describe("canal de venta de un pedido", () => {
  it("acepta solo los seis canales de las fichas", () => {
    expect(SALES_CHANNELS).toEqual(["WHATSAPP", "INSTAGRAM", "TIKTOK", "PRESENCIAL", "FERIA", "OTRO"]);
    expect(parseSalesChannel("INSTAGRAM")).toBe(OrderSalesChannel.INSTAGRAM);
    expect(parseSalesChannel("instagram")).toBeNull();
    expect(parseSalesChannel("STORE")).toBeNull();
    expect(parseSalesChannel(undefined)).toBeNull();
  });

  it("la lista de espera ya trae el canal; la web no es un canal del panel", () => {
    expect(salesChannelFromWaitlist("TIKTOK")).toBe(OrderSalesChannel.TIKTOK);
    expect(salesChannelFromWaitlist("OTHER")).toBe(OrderSalesChannel.OTRO);
    expect(salesChannelFromWaitlist("WEB")).toBeNull();
  });

  it("para las ventas por canal: lo elegido gana; si no, lo que implica el sistema; el panel sin elegir es «Sin registrar»", () => {
    expect(reportChannelOf({ salesChannel: OrderSalesChannel.INSTAGRAM, source: OrderSource.PANEL })).toBe("INSTAGRAM");
    expect(reportChannelOf({ salesChannel: null, source: OrderSource.STORE })).toBe("TIENDA");
    expect(reportChannelOf({ salesChannel: null, source: OrderSource.WHATSAPP })).toBe("WHATSAPP");
    expect(reportChannelOf({ salesChannel: null, source: OrderSource.POS })).toBe("PRESENCIAL");
    expect(reportChannelOf({ salesChannel: null, source: OrderSource.FAIR })).toBe("FERIA");
    expect(reportChannelOf({ salesChannel: null, source: OrderSource.PANEL })).toBe("SIN_REGISTRAR");
    expect(reportChannelOf({ salesChannel: null, source: null })).toBe("SIN_REGISTRAR");
  });
});

describe("filtro «Origen» de la lista de Pedidos", () => {
  it("va y vuelve por la URL y cuenta como filtro activo", () => {
    const query = new URLSearchParams();
    writeOrderListFilters(query, { channel: null, date: { kind: "todas" }, origin: "TIENDA" });
    expect(query.get("origen")).toBe("TIENDA");
    const parsed = parseOrderListFilters(query);
    expect(parsed.origin).toBe("TIENDA");
    expect(hasActiveListFilters(parsed)).toBe(true);
    expect(parseOrderListFilters(new URLSearchParams("origen=NADA")).origin).toBeNull();
  });

  it("la lista en memoria usa la misma regla que las ventas por canal", () => {
    const base = { type: OrderType.STANDARD, createdAt: new Date() };
    const filters = { channel: null, date: { kind: "todas" as const }, origin: "WHATSAPP" as const };
    expect(orderMatchesListFilters({ ...base, salesChannel: OrderSalesChannel.WHATSAPP, source: OrderSource.PANEL }, filters)).toBe(true);
    expect(orderMatchesListFilters({ ...base, salesChannel: null, source: OrderSource.WHATSAPP }, filters)).toBe(true);
    expect(orderMatchesListFilters({ ...base, salesChannel: OrderSalesChannel.INSTAGRAM, source: OrderSource.WHATSAPP }, filters)).toBe(false);
  });

  it("la consulta a la base sigue la misma regla", () => {
    expect(orderOriginWhere("INSTAGRAM")).toEqual({ salesChannel: "INSTAGRAM" });
    expect(orderOriginWhere("WHATSAPP")).toEqual({ OR: [{ salesChannel: "WHATSAPP" }, { salesChannel: null, source: "WHATSAPP" }] });
    expect(orderOriginWhere("TIENDA")).toEqual({ salesChannel: null, source: "STORE" });
    expect(orderOriginWhere("SIN_REGISTRAR")).toEqual({
      salesChannel: null,
      OR: [{ source: null }, { source: { notIn: ["STORE", "WHATSAPP", "POS", "FAIR"] } }],
    });
  });
});
