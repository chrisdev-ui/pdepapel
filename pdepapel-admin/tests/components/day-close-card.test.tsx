// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DayCloseCard } from "@/app/(dashboard)/[storeId]/(routes)/ventas-rapidas/components/day-close-card";
import { buildPointOfSaleDaySummary, RECENT_SALES_LIMIT } from "@/lib/point-of-sale-day";

const sales = Array.from({ length: RECENT_SALES_LIMIT + 2 }, (_, index) => ({
  id: `order-${index}`,
  orderNumber: `ORD-${index}`,
  total: 10000,
  paidAt: new Date(Date.UTC(2026, 9, 8, 15, index)),
  createdAt: new Date(Date.UTC(2026, 9, 8, 15, index)),
  payment: { method: null },
  orderItems: [{ quantity: 1 }],
}));

describe("DayCloseCard", () => {
  afterEach(cleanup);

  it("un día anterior lleva la fecha en el título y lista todas las ventas, cada una con su pedido", () => {
    render(<DayCloseCard storeId="store-1" summary={buildPointOfSaleDaySummary(sales)} day={{ label: "jueves 8 de octubre de 2026" }} />);
    expect(screen.getByText("Ventas del jueves 8 de octubre de 2026")).toBeTruthy();
    const list = screen.getByText("Ventas del día").nextElementSibling as HTMLElement;
    expect(within(list).getAllByRole("link")).toHaveLength(RECENT_SALES_LIMIT + 2);
    expect(within(list).getByRole("link", { name: "ORD-0" }).getAttribute("href")).toBe("/store-1/pedidos/order-0");
  });

  it("hoy muestra solo las últimas y explica «Deshacer» y Movimientos", () => {
    render(<DayCloseCard storeId="store-1" summary={buildPointOfSaleDaySummary(sales)} />);
    expect(screen.getByText("Cierre del día")).toBeTruthy();
    const list = screen.getByText("Últimas ventas").nextElementSibling as HTMLElement;
    expect(within(list).getAllByRole("link")).toHaveLength(RECENT_SALES_LIMIT);
    expect(screen.getByText(/usa «Deshacer» en los 30 minutos siguientes a la venta/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Movimientos de inventario" }).getAttribute("href")).toBe("/store-1/movimientos-inventario");
    expect(screen.getByRole("link", { name: "Pedidos, canal Presencial" }).getAttribute("href")).toBe("/store-1/pedidos?vista=todos&canal=presencial");
  });

  it("un día sin ventas lo dice", () => {
    render(<DayCloseCard storeId="store-1" summary={buildPointOfSaleDaySummary([])} day={{ label: "lunes 5 de octubre de 2026" }} />);
    expect(screen.getByText("Ese día no hubo ventas presenciales.")).toBeTruthy();
  });
});
