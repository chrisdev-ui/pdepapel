// @vitest-environment jsdom
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrderStatusBar } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/status-bar";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import { buildOrderTimeline, getNextStepCard } from "@/lib/order-timeline";
import { scrubOrder } from "@/lib/viewer-payloads";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";

const order = (trackingCode: string | null) => ({
  id: "o1",
  status: OrderStatus.PAID,
  type: OrderType.STANDARD,
  createdAt: new Date("2026-10-19T10:00:00.000Z"),
  paidAt: new Date("2026-10-19T11:00:00.000Z"),
  fullName: "Clienta",
  payment: { method: PaymentMethod.Bold, transactionId: "TX-1" },
  shipping: {
    status: ShippingStatus.Preparing,
    provider: ShippingProvider.ENVIOCLICK,
    courier: "Coordinadora",
    carrierName: "Coordinadora",
    trackingCode,
    trackingUrl: trackingCode ? "https://track.test/1" : null,
    guideUrl: trackingCode ? "https://guide.test/1" : null,
  },
});

/** Lo que el servidor manda a cada rol y lo que pinta la barra de estado con eso. */
function renderAs(role: "owner" | "viewer", trackingCode: string | null) {
  const raw = order(trackingCode);
  const data = role === "viewer" ? scrubOrder(raw) : raw;
  const now = new Date("2026-10-19T12:00:00.000Z");
  const nextStep = getNextStepCard({ ...data, openInventoryIssues: 0 } as never, "s");
  const steps = buildOrderTimeline({ ...data, openInventoryIssues: 0 } as never, now);
  const view = render(
    <ViewerAccessProvider role={role}>
      <OrderStatusBar
        status={data.status}
        type={data.type}
        paymentMethod={data.payment?.method ?? null}
        shippingProvider={ShippingProvider.ENVIOCLICK}
        trackingCode={(data.shipping as { trackingCode?: string | null }).trackingCode ?? null}
        guideOnFile={(data.shipping as { hasGuide?: boolean }).hasGuide === true}
        nextStep={nextStep}
        steps={steps}
        loading={false}
        onTransition={vi.fn()}
      />
    </ViewerAccessProvider>,
  );
  const section = within(view.container.querySelector("#estado-del-pedido") as HTMLElement);
  const result = {
    data,
    title: section.getByRole("heading", { level: 2 }).textContent,
    steps: steps.map((step) => `${step.label}:${step.state}`),
  };
  cleanup();
  return result;
}

afterEach(cleanup);

/**
 * La cuenta de solo lectura no recibe el número de guía. Sin él, la ficha le
 * decía «Sin guía · crear la guía» a un pedido que ya iba en camino. Ahora el
 * servidor manda `shipping.hasGuide` y la etapa sale igual que para la dueña.
 */
describe("etapa del pedido: dueña y solo lectura ven lo mismo", () => {
  it("con guía: «El pedido va en camino» para las dos, sin el número para solo lectura", () => {
    const owner = renderAs("owner", "GUIA-1");
    const viewer = renderAs("viewer", "GUIA-1");
    expect(owner.title).toBe("El pedido va en camino");
    expect(viewer.title).toBe(owner.title);
    expect(viewer.steps).toEqual(owner.steps);
    assertNoForbiddenKeys(viewer.data, "viewer");
  });

  it("sin guía: «crear la guía» para las dos", () => {
    const owner = renderAs("owner", null);
    const viewer = renderAs("viewer", null);
    expect(owner.title).toBe("Siguiente paso: crear la guía de envío");
    expect(viewer.title).toBe(owner.title);
    expect(viewer.steps).toEqual(owner.steps);
    assertNoForbiddenKeys(viewer.data, "viewer");
  });

  it("la marca solo existe para solo lectura: la dueña recibe el pedido tal cual", () => {
    expect(order("GUIA-1").shipping).not.toHaveProperty("hasGuide");
    expect(scrubOrder(order("GUIA-1")).shipping).toMatchObject({ hasGuide: true });
    expect(screen.queryByText(/GUIA-1/)).toBeNull();
  });
});
