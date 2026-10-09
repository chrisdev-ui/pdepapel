// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ patch: vi.fn(), refresh: vi.fn(), toast: vi.fn() }));
vi.mock("axios", () => ({ default: { patch: mocks.patch, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import {
  CancelAsFraudDialog,
  canCancelAsFraud,
  deleteWarning,
} from "@/app/(dashboard)/[storeId]/(routes)/pedidos/components/cancel-as-fraud";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.patch.mockResolvedValue({ data: [] });
});
afterEach(cleanup);

describe("Cancelar como fraude/bot", () => {
  it("confirma y cancela el pedido con la marca de fraude, sin borrarlo", async () => {
    const onClose = vi.fn();
    render(<CancelAsFraudDialog storeId="store-1" order={{ id: "order-1", orderNumber: "ORD-9" }} open onClose={onClose} />);
    expect(screen.getByText("¿Cancelar el pedido ORD-9 como fraude o bot?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar como fraude" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/api/store-1/orders", { ids: ["order-1"], status: "CANCELLED", fraud: true }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pedido cancelado como fraude" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("se ofrece en pedidos de la tienda que no están ya marcados ni entregados", () => {
    expect(canCancelAsFraud({ status: "PENDING", type: "STANDARD", riskReasons: null })).toBe(true);
    expect(canCancelAsFraud({ status: "PAID", type: "GIFT_CARD", riskReasons: "envio-rapido" })).toBe(true);
    expect(canCancelAsFraud({ status: "CANCELLED", type: "STANDARD", riskReasons: "fraude-confirmado" })).toBe(false);
    expect(canCancelAsFraud({ status: "SENT", type: "STANDARD", riskReasons: null })).toBe(false);
    expect(canCancelAsFraud({ status: "PAID", type: "POINT_OF_SALE", riskReasons: null })).toBe(false);
  });

  it("eliminar un pedido sin pagar sugiere cancelarlo como fraude", () => {
    expect(deleteWarning(false)).toBe(
      "¿Seguro? Mejor usa «Cancelar como fraude/bot»: el pedido se conserva y los próximos con el mismo correo o celular salen marcados. Eliminar no se puede deshacer.",
    );
    expect(deleteWarning(true)).toContain("el inventario vuelve con un movimiento");
  });
});
