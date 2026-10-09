import { OrderType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  getOrderDateRange,
  orderMatchesListFilters,
  parseOrderListFilters,
  writeOrderListFilters,
} from "@/lib/order-list-filters";

// 2026-10-09 15:00 en Colombia.
const NOW = new Date("2026-10-09T20:00:00.000Z");
const at = (iso: string) => ({ type: OrderType.POINT_OF_SALE, createdAt: iso });

describe("filtros de la lista de pedidos", () => {
  it("lee canal y fecha de la URL e ignora valores inventados", () => {
    expect(parseOrderListFilters(new URLSearchParams("canal=presencial&fecha=ayer"))).toEqual({ channel: "presencial", date: { kind: "ayer" } });
    expect(parseOrderListFilters(new URLSearchParams("canal=marte&fecha=siempre"))).toEqual({ channel: null, date: { kind: "todas" } });
    expect(parseOrderListFilters(new URLSearchParams("fecha=rango&desde=2026-10-01&hasta=2026-10-05"))).toEqual({
      channel: null,
      date: { kind: "rango", from: "2026-10-01", to: "2026-10-05" },
    });
    expect(parseOrderListFilters(new URLSearchParams("fecha=rango&desde=ayer")).date).toEqual({ kind: "todas" });
  });

  it("escribe en la URL solo lo que filtra y conserva lo demás (la pestaña)", () => {
    const query = new URLSearchParams("vista=todos&canal=feria");
    writeOrderListFilters(query, { channel: "presencial", date: { kind: "rango", from: "2026-10-01", to: "2026-10-05" } });
    expect(query.toString()).toBe("vista=todos&canal=presencial&fecha=rango&desde=2026-10-01&hasta=2026-10-05");
    writeOrderListFilters(query, { channel: null, date: { kind: "todas" } });
    expect(query.toString()).toBe("vista=todos");
  });

  it("hoy, ayer y 7 días son días de Colombia", () => {
    expect(getOrderDateRange({ kind: "hoy" }, NOW)).toEqual({ start: new Date("2026-10-09T05:00:00.000Z"), end: new Date("2026-10-10T04:59:59.999Z") });
    expect(getOrderDateRange({ kind: "ayer" }, NOW)).toEqual({ start: new Date("2026-10-08T05:00:00.000Z"), end: new Date("2026-10-09T04:59:59.999Z") });
    expect(getOrderDateRange({ kind: "7dias" }, NOW)?.start).toEqual(new Date("2026-10-03T05:00:00.000Z"));
    expect(getOrderDateRange({ kind: "rango", from: "2026-10-05", to: "2026-10-01" }, NOW)).toEqual({
      start: new Date("2026-10-01T05:00:00.000Z"),
      end: new Date("2026-10-06T04:59:59.999Z"),
    });
    expect(getOrderDateRange({ kind: "todas" }, NOW)).toBeNull();
  });

  it("una venta de las 11 p. m. de ayer en Colombia es de ayer, aunque en UTC ya sea hoy", () => {
    const lateYesterday = at("2026-10-09T04:00:00.000Z");
    expect(orderMatchesListFilters(lateYesterday, { channel: null, date: { kind: "ayer" } }, NOW)).toBe(true);
    expect(orderMatchesListFilters(lateYesterday, { channel: null, date: { kind: "hoy" } }, NOW)).toBe(false);
  });

  it("el canal se compara con el tipo del pedido", () => {
    const filters = { channel: "presencial" as const, date: { kind: "todas" as const } };
    expect(orderMatchesListFilters(at("2026-10-09T15:00:00.000Z"), filters, NOW)).toBe(true);
    expect(orderMatchesListFilters({ type: OrderType.STANDARD, createdAt: "2026-10-09T15:00:00.000Z" }, filters, NOW)).toBe(false);
    expect(orderMatchesListFilters({ type: OrderType.FESTIVAL, createdAt: new Date("2026-10-09T15:00:00.000Z") }, { channel: "feria", date: { kind: "hoy" } }, NOW)).toBe(true);
  });
});
