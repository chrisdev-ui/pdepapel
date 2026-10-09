// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn(), toast: vi.fn() }));
vi.mock("axios", () => ({ default: { post: mocks.post, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { RiskReviewCard } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/risk-review-card";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";

function renderCard(order: Record<string, unknown>, role: "viewer" | null = null) {
  return render(
    <ViewerAccessProvider role={role}>
      <RiskReviewCard storeId="store-1" order={{ id: "order-1", riskScore: 0, riskReasons: null, giftCardReview: null, ...order } as never} />
    </ViewerAccessProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ data: { decision: "approve", delivered: true } });
});
afterEach(cleanup);

describe("RiskReviewCard", () => {
  it("no pinta nada en un pedido normal", () => {
    const { container } = renderCard({});
    expect(container.textContent).toBe("");
  });

  it("explica por qué parece un bot", () => {
    renderCard({ riskScore: 4, riskReasons: "envio-rapido,pedidos-repetidos" });
    expect(screen.getByText("⚠️ Posible bot")).toBeTruthy();
    expect(screen.getByText("Formulario enviado en segundos")).toBeTruthy();
    expect(screen.getByText("Varios pedidos seguidos desde la misma conexión o correo")).toBeTruthy();
  });

  it("«Aprobar y enviar tarjeta» decide en un clic y recarga el pedido", async () => {
    renderCard({ giftCardReview: "PENDING" });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar y enviar tarjeta" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/orders/order-1/gift-card-review", { decision: "approve" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Tarjeta aprobada y enviada" }));
  });

  it("«Rechazar» no emite la tarjeta", async () => {
    mocks.post.mockResolvedValue({ data: { decision: "reject", delivered: false } });
    renderCard({ giftCardReview: "PENDING" });
    fireEvent.click(screen.getByRole("button", { name: "Rechazar (no enviar código)" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/orders/order-1/gift-card-review", { decision: "reject" }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Tarjeta rechazada" }));
  });

  it("si el correo no sale lo dice para reenviarlo", async () => {
    mocks.post.mockResolvedValue({ data: { decision: "approve", delivered: false } });
    renderCard({ giftCardReview: "PENDING" });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar y enviar tarjeta" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Tarjeta aprobada, pero el correo no salió" })));
  });

  it("una cuenta de solo lectura ve el estado sin botones activos", () => {
    renderCard({ giftCardReview: "PENDING" }, "viewer");
    expect((screen.getByRole("button", { name: "Aprobar y enviar tarjeta" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("una tarjeta rechazada queda dicha, sin botones", () => {
    renderCard({ giftCardReview: "REJECTED" });
    expect(screen.getByText(/Rechazaste esta tarjeta/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
