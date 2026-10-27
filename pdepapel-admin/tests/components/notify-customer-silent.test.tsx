// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Avisar a la clienta»: la casilla del cambio en lote manda la bandera, y la
 * fila de un cambio sin avisar se lee bien en «Avisos a la clienta» (sin
 * «Reenviar», que no tiene qué reenviar, ni «reenviado»).
 */
const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
  usePathname: () => "/store-1/pedidos",
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/api", () => ({ makeApiCall: mocks.api }));
vi.mock("axios", () => ({ default: { post: vi.fn() }, isAxiosError: () => false }));

import { OrderNotificationsCard } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-notifications-card";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import { DataTableActionOptions } from "@/components/ui/data-table-action-options";
import { Models } from "@/constants";

const table = {
  getFilteredSelectedRowModel: () => ({ rows: [{ original: { id: "o1" } }, { original: { id: "o2" } }] }),
  resetRowSelection: vi.fn(),
};

async function chooseBulk(item: string) {
  render(
    <ViewerAccessProvider role="owner">
      <DataTableActionOptions table={table as never} model={Models.Orders} />
    </ViewerAccessProvider>,
  );
  const trigger = screen.getByRole("button", { name: /Acciones/ });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
  return screen.findByRole("alertdialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockResolvedValue({});
});
afterEach(cleanup);

describe("cambio en lote", () => {
  it("«Pagada» con la casilla marcada por defecto manda notifyCustomer: true", async () => {
    await chooseBulk("Pagada");
    const box = screen.getByRole("checkbox", { name: "Avisar a la clienta" });
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Las tarjetas de regalo pagadas sí se entregan/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí, marcar como pagados" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
    expect(mocks.api.mock.calls[0][2]).toEqual({ ids: ["o1", "o2"], status: "PAID", notifyCustomer: true });
  });

  it("desmarcada manda notifyCustomer: false y la confirmación ya no promete el correo", async () => {
    await chooseBulk("Entregada");
    expect(screen.getByText(/cada cliente recibe el aviso por correo/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Avisar a la clienta" }));
    expect(screen.getByText(/sin avisarle al cliente/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cambiar el envío" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
    expect(mocks.api.mock.calls[0][2]).toEqual({ ids: ["o1", "o2"], shipping: "Delivered", notifyCustomer: false });
  });

  it("borrar no muestra la casilla", async () => {
    await chooseBulk("Eliminar");
    expect(screen.queryByRole("checkbox", { name: "Avisar a la clienta" })).toBeNull();
  });
});

describe("Avisos a la clienta", () => {
  it("una fila de cambio sin avisar dice qué estado y no ofrece «Reenviar»", () => {
    render(
      <OrderNotificationsCard
        storeId="store-1"
        orderId="o1"
        view={{
          rows: [
            { id: "r1", createdAt: new Date("2026-10-27T15:00:00Z"), milestone: "estado:PAID", channel: "EMAIL", role: "customer", status: "SKIPPED", reason: "Cambio de estado sin avisar", resent: false },
            { id: "r2", createdAt: new Date("2026-10-27T14:00:00Z"), milestone: "en_camino", channel: "EMAIL", role: "customer", status: "SENT", reason: null, resent: false },
          ],
          hasGuide: false,
          whatsapp: { optInAt: null, source: null, version: null, optOutAt: null, canRecord: false, switchOn: false },
        }}
      />,
    );
    expect(screen.getByText("Cambio de estado sin avisar (Pagado)")).toBeTruthy();
    expect(screen.getByText("No aplica")).toBeTruthy();
    const resend = screen.getAllByRole("button", { name: /^Reenviar/ });
    expect(resend).toHaveLength(1);
    expect(resend[0].getAttribute("aria-label")).toBe("Reenviar «En tránsito»");
  });
});
