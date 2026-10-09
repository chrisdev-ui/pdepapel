// @vitest-environment jsdom
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/store-1/pedidos",
  useParams: () => ({ storeId: "store-1" }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/components/shell/viewer-access", () => ({ useCanWrite: () => true }));
vi.mock("@/components/ui/refresh-button", () => ({ RefreshButton: () => null }));
vi.mock("@/components/ui/data-table", () => ({
  DataTable: ({ data, emptyState }: { data: { id: string; orderNumber: string }[]; emptyState: { title: string; action?: ReactNode } }) =>
    data.length === 0 ? (
      <div>
        <p>{emptyState.title}</p>
        {emptyState.action}
      </div>
    ) : (
      <ul aria-label="pedidos">
        {data.map((row) => (
          <li key={row.id}>{row.orderNumber}</li>
        ))}
      </ul>
    ),
}));

import OrderClient from "@/app/(dashboard)/[storeId]/(routes)/pedidos/components/client";

const base = {
  fullName: "Consumidor final",
  phone: "",
  address: "",
  city: "",
  documentId: null,
  isGift: false,
  giftRecipientName: null,
  riskScore: 0,
  riskReasons: null,
  giftCardReview: null,
  total: 10000,
  expiresAt: null,
  orderItems: [],
  shipping: null,
  openInventoryIssues: 0,
};
const now = new Date();
const orders = [
  { ...base, id: "pos-1", orderNumber: "POS-1", type: OrderType.POINT_OF_SALE, status: OrderStatus.PAID, createdAt: now, paidAt: now, payment: { method: PaymentMethod.CASH } },
  { ...base, id: "web-1", orderNumber: "WEB-1", type: OrderType.STANDARD, status: OrderStatus.PENDING, createdAt: now, paidAt: null, payment: { method: PaymentMethod.BankTransfer } },
] as never[];

describe("Pedidos: filtros de canal y fecha", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/store-1/pedidos");
  });
  afterEach(() => {
    cleanup();
    navigation.search = "";
  });

  it("canal=presencial en «Todos» deja solo las ventas del punto de venta", () => {
    navigation.search = "vista=todos&canal=presencial";
    window.history.replaceState(null, "", `/store-1/pedidos?${navigation.search}`);
    render(<OrderClient data={orders} />);
    const list = screen.getByRole("list", { name: "pedidos" });
    expect(within(list).getByText("POS-1")).toBeTruthy();
    expect(within(list).queryByText("WEB-1")).toBeNull();
    expect(screen.getByRole("tab", { name: /^Todos\s*1$/ })).toBeTruthy();
  });

  it("en una pestaña vacía con filtros ofrece ir a «Todos» con el conteo", () => {
    navigation.search = "canal=presencial";
    window.history.replaceState(null, "", `/store-1/pedidos?${navigation.search}`);
    render(<OrderClient data={orders} />);
    expect(screen.getByText("Nada en esta cola con estos filtros")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver en «Todos» (1)" }));
    expect(window.location.search).toBe("?canal=presencial&vista=todos");
  });

  it("elegir «Ayer» queda en la URL sin perder la pestaña", () => {
    navigation.search = "vista=todos";
    window.history.replaceState(null, "", "/store-1/pedidos?vista=todos");
    render(<OrderClient data={orders} />);
    fireEvent.click(screen.getByRole("radio", { name: "Ayer" }));
    expect(window.location.search).toBe("?vista=todos&fecha=ayer");
    expect(screen.getByText("Ningún pedido con estos filtros")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Quitar filtros" })[0]);
    expect(window.location.search).toBe("?vista=todos");
  });
});
