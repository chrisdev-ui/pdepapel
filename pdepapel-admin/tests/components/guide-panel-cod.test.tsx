// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ORD-1791998787841-915 (2026-10-15): Paula eligió ENVIA con recaudo, la
 * tarifa quedó solo en el formulario y «Crear guía» seguía apagado porque
 * faltaba «Guardar cambios». Ahora el mismo botón guarda y crea la guía,
 * muestra lo que cobra EnvioClick (flete + seguro + recaudo) y el fallo de
 * antes no se confunde con el de ahora.
 */
const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));

vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { GuidePanel } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/shipping/guide-panel";

const rate = { idRate: 777001, carrier: "ENVIA", product: "Normal", flete: 18074, minimumInsurance: 0, totalCost: 18074, deliveryDays: 3, isCOD: true, codCost: 8391 };
const attemptedAt = "2026-10-15T17:47:30.277Z";

const renderPanel = (overrides: Partial<Parameters<typeof GuidePanel>[0]> = {}) =>
  render(
    <GuidePanel
      storeId="store-1"
      orderId="order-1"
      status="PENDING"
      isCOD
      carrier="ENVIA"
      cost={18074}
      rate={rate}
      saved={false}
      stale={false}
      guideError="Este no es un idRate válido para COD."
      guideAttemptedAt={attemptedAt}
      quotedAt={new Date("2026-10-15T21:10:26.000Z")}
      saveForGuide={vi.fn().mockResolvedValue(true)}
      {...overrides}
    />,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("guía contra entrega desde el panel", () => {
  it("con la tarifa sin guardar, un solo botón guarda y crea la guía con el total de EnvioClick", async () => {
    const saveForGuide = vi.fn().mockResolvedValue(true);
    mocks.post.mockResolvedValue({ data: { data: { tracker: "GUIA555" } } });
    renderPanel({ saveForGuide });

    expect(screen.getByTestId("envioclick-total")).toHaveTextContent(/Total que cobra EnvioClick: \$\s26\.465 \(flete \$\s18\.074 \+ seguro \$\s0 \+ recaudo \$\s8\.391\)/);
    const button = screen.getByRole("button", { name: /Guardar y crear guía · \$\s26\.465/ });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    fireEvent.click(await screen.findByRole("button", { name: "Sí, crear la guía" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/orders/order-1/shipping/create-guide"));
    expect(saveForGuide).toHaveBeenCalledTimes(1);
    expect(saveForGuide.mock.invocationCallOrder[0]).toBeLessThan(mocks.post.mock.invocationCallOrder[0]);
  });

  it("si no se pudo guardar, no pide la guía", async () => {
    const saveForGuide = vi.fn().mockResolvedValue(false);
    renderPanel({ saveForGuide });
    fireEvent.click(screen.getByRole("button", { name: /Guardar y crear guía/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Sí, crear la guía" }));
    await waitFor(() => expect(saveForGuide).toHaveBeenCalled());
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("el intento fallido anterior a la cotización nueva no se muestra; sin cotización nueva sale con su hora", () => {
    renderPanel();
    expect(screen.queryByTestId("guide-error")).not.toBeInTheDocument();
    cleanup();

    renderPanel({ quotedAt: null, saved: true });
    expect(screen.getByTestId("guide-error")).toHaveTextContent(/Último intento fallido \(15.*oct.*12:47.*\): Este no es un idRate válido para COD\./);
  });

  it("con la tarifa ya guardada el botón solo crea la guía", () => {
    renderPanel({ saved: true });
    expect(screen.getByRole("button", { name: /^Crear guía · \$\s26\.465/ })).toBeEnabled();
  });
});
