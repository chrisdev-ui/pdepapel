// @vitest-environment jsdom
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pedidos se pagina, filtra y busca en el servidor: la pantalla solo escribe
 * la URL (pestaña, canal, fecha, búsqueda y página) con `router.replace`, y el
 * servidor arma la página. Cambiar pestaña, filtro o búsqueda vuelve a la
 * página 1.
 */
const navigation = vi.hoisted(() => ({ search: "", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: navigation.replace }),
  usePathname: () => "/store-1/pedidos",
  useParams: () => ({ storeId: "store-1" }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/components/shell/viewer-access", () => ({ useCanWrite: () => true }));
vi.mock("@/components/ui/refresh-button", () => ({ RefreshButton: () => null }));
type ServerProps = { page: number; pageCount: number; total: number; onPageChange: (page: number) => void; onSearchChange: (value: string) => void };
vi.mock("@/components/ui/data-table", () => ({
  DataTable: ({
    data,
    emptyState,
    server,
    rowSelection = {},
    onRowSelectionChange,
  }: {
    data: { id: string; orderNumber: string }[];
    emptyState: { title: string; action?: ReactNode };
    server: ServerProps;
    rowSelection?: Record<string, boolean>;
    onRowSelectionChange?: (selection: Record<string, boolean>) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onRowSelectionChange?.(Object.fromEntries(data.map((row) => [row.id, true])))}>
        Marcar la página
      </button>
      <span>{`${Object.values(rowSelection).filter(Boolean).length} seleccionados`}</span>
      <input aria-label="Buscar" onChange={(event) => server.onSearchChange(event.target.value)} />
      <span>{`Página ${server.page} de ${server.pageCount} · ${server.total}`}</span>
      <button type="button" onClick={() => server.onPageChange(server.page + 1)}>
        Siguiente
      </button>
      {data.length === 0 ? (
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
      )}
    </div>
  ),
}));

import OrderClient from "@/app/(dashboard)/[storeId]/(routes)/pedidos/components/client";

const now = new Date();
const orders = [
  {
    id: "pos-1", orderNumber: "POS-1", type: OrderType.POINT_OF_SALE, status: OrderStatus.PAID, createdAt: now, paidAt: now, payment: { method: PaymentMethod.CASH },
    fullName: "Consumidor final", phone: "", address: "", city: "", documentId: null, isGift: false, giftRecipientName: null, riskScore: 0, riskReasons: null, giftCardReview: null, total: 10000, expiresAt: null, orderItems: [], shipping: null, openInventoryIssues: 0,
  },
] as never[];
const counts = { "por-atender": 0, "por-verificar": 0, "por-despachar": 0, "por-entregar": 0, "en-camino": 0, "con-novedad": 0, "sin-cuadrar": 0, cotizaciones: 0, "borradores-viejos": 0, "sin-unidad": 0, todos: 7 };
const props = { data: orders, counts, total: 30, page: 2, pageCount: 2, pageSize: 25, totalOrders: 738, search: "" };
const lastUrl = () => navigation.replace.mock.calls.at(-1)?.[0] as string;

describe("Pedidos: la URL manda y el servidor pagina", () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    window.history.replaceState(null, "", "/store-1/pedidos");
  });
  afterEach(() => {
    cleanup();
    navigation.search = "";
    vi.useRealTimers();
  });

  const at = (search: string) => {
    navigation.search = search;
    window.history.replaceState(null, "", `/store-1/pedidos${search ? `?${search}` : ""}`);
  };

  it("pinta la página que le da el servidor con sus conteos y el total de la tienda", () => {
    at("vista=todos&pagina=2");
    render(<OrderClient {...props} />);
    expect(screen.getByText("POS-1")).toBeTruthy();
    expect(screen.getByText("Página 2 de 2 · 30")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Todos\s*7$/ })).toBeTruthy();
    expect(screen.getByText(/738 en total/)).toBeTruthy();
  });

  it("cambiar de pestaña escribe la URL con router.replace y vuelve a la página 1", () => {
    at("vista=todos&pagina=2");
    render(<OrderClient {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Por verificar/ }));
    expect(lastUrl()).toBe("/store-1/pedidos?vista=por-verificar");
    expect(navigation.replace.mock.calls.at(-1)?.[1]).toEqual({ scroll: false });
  });

  it("un filtro de fecha queda en la URL sin perder la pestaña y quita la página", () => {
    at("vista=todos&pagina=2");
    render(<OrderClient {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Ayer" }));
    expect(lastUrl()).toBe("/store-1/pedidos?vista=todos&fecha=ayer");
  });

  it("la página siguiente va en la URL", () => {
    at("vista=todos");
    render(<OrderClient {...props} page={1} pageCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(lastUrl()).toBe("/store-1/pedidos?vista=todos&pagina=2");
  });

  it("la búsqueda espera a que se deje de escribir y vuelve a la página 1", () => {
    vi.useFakeTimers();
    at("vista=todos&pagina=3");
    render(<OrderClient {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar" }), { target: { value: "lap" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar" }), { target: { value: "lapicero" } });
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toBe("/store-1/pedidos?vista=todos&q=lapicero");
  });

  it("una pestaña vacía con filtros ofrece ir a «Todos» con el conteo del servidor", () => {
    at("canal=presencial");
    render(<OrderClient {...props} data={[]} total={0} page={1} pageCount={1} />);
    expect(screen.getByText("Nada en esta cola con estos filtros")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver en «Todos» (7)" }));
    expect(lastUrl()).toBe("/store-1/pedidos?canal=presencial&vista=todos");
  });

  it("las acciones masivas son por página: cambiar de página, pestaña o filtro suelta la selección", () => {
    at("vista=todos");
    render(<OrderClient {...props} page={1} pageCount={3} />);
    const mark = () => fireEvent.click(screen.getByRole("button", { name: "Marcar la página" }));
    mark();
    expect(screen.getByText("1 seleccionados")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("0 seleccionados")).toBeTruthy();
    mark();
    fireEvent.click(screen.getByRole("tab", { name: /^Por verificar/ }));
    expect(screen.getByText("0 seleccionados")).toBeTruthy();
    mark();
    fireEvent.click(screen.getByRole("radio", { name: "Ayer" }));
    expect(screen.getByText("0 seleccionados")).toBeTruthy();
  });
});
