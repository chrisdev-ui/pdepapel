// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * «Reservar» en la tarjeta «Pedido solicitado» de una conversación: abre la
 * hoja con el producto, la cantidad, el nombre y el celular de la clienta.
 * Muestra lo que se puede reservar con el stock y lo ya reservado. Un pedido
 * descartado no ofrece reservar.
 */
const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("axios", () => ({ default: { post: mocks.post, patch: vi.fn(), isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/components/ui/async-product-select", () => ({ AsyncProductSelect: () => <output data-testid="picker" /> }));
vi.mock("@/components/ui/product-scan-button", () => ({ ProductScanButton: () => null }));
vi.mock("@/components/ui/phone-input", () => ({
  PhoneInput: ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) => (
    <input id={id} aria-label="Celular" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import { ConversationThread } from "@/app/(dashboard)/[storeId]/(routes)/conversaciones/[conversationId]/components/conversation-thread";

const conversation = (status: "pending" | "dismissed") =>
  ({
    id: "conv-1",
    phone: "+573001234567",
    bsuid: null,
    username: null,
    contactName: "Laura",
    status: "NEEDS_OWNER",
    lastInboundAt: new Date(),
    lastOutboundAt: new Date(),
    lastOwnerAt: null,
    orderId: null,
    createdAt: new Date(),
    ignored: false,
    skippedCount: 0,
    messages: [
      {
        id: "m-1",
        direction: "OUTBOUND",
        sentBy: "BOT",
        status: "SENT",
        body: "Le paso tu pedido a Paula.",
        mediaType: null,
        createdAt: new Date(),
        cart: null,
        tappedOptionId: null,
        orderRequest: { status, items: [{ productId: "p-1", name: "Sobre de manila", quantity: 3, unitPrice: 1500, stockConfirmed: true }] },
        webOrigin: null,
        recovered: null,
      },
    ],
  }) as never;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Reservar desde un pedido de WhatsApp", () => {
  it("abre la hoja prellenada con lo que pidió la clienta y la reserva", async () => {
    mocks.post.mockResolvedValue({ data: {} });
    render(<ConversationThread conversation={conversation("pending")} storeId="store-1" reservationDefaultDays={2} productStock={{ "p-1": { stock: 10, reservedUnits: 2 } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

    const sheet = await screen.findByRole("dialog", { name: "Reservar" });
    expect(within(sheet).getByText("Sobre de manila")).toBeInTheDocument();
    expect(within(sheet).getByTestId("reserve-available")).toHaveTextContent(/^Disponibles para reservar: 8 · stock 10 · 2 reservados$/);
    expect(within(sheet).getByLabelText("Clienta")).toHaveValue("Laura");
    expect(within(sheet).getByLabelText("Celular")).toHaveValue("+573001234567");
    expect(within(sheet).getByLabelText("Días")).toHaveValue(2);
    expect(within(sheet).queryByTestId("picker")).not.toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Reservar 3 unidades" }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/api/store-1/stock-reservations",
        { productId: "p-1", quantity: 3, customerName: "Laura", customerPhone: "+573001234567", days: 2, note: "Pedido solicitado por WhatsApp" },
        expect.anything(),
      ),
    );
  });

  it("un pedido descartado no ofrece reservar", () => {
    render(<ConversationThread conversation={conversation("dismissed")} storeId="store-1" />);
    expect(screen.getByText(/Pedido solicitado · descartado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reservar" })).not.toBeInTheDocument();
  });
});
