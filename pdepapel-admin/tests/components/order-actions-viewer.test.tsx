// @vitest-environment jsdom
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("axios", () => ({ default: { post: vi.fn() } }));

import { StatusActions } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/status-actions";
import { ShippingInfo } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/shipping-info";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";

const shipping = {
  id: "s1",
  status: ShippingStatus.Preparing,
  provider: ShippingProvider.ENVIOCLICK,
  carrierName: "Coordinadora",
  courier: "Coordinadora",
  envioClickIdOrder: 123,
  cost: 12000,
  // Con el registro completo (como lo ve la dueña) para probar que la guarda del rol apaga igual.
  trackingCode: "GUIA-1",
  guideUrl: "https://guide.test/1",
} as never;

afterEach(cleanup);

function renderAs(role: "owner" | "viewer") {
  return render(
    <ViewerAccessProvider role={role}>
      <StatusActions status={OrderStatus.PAID} type={OrderType.STANDARD} paymentMethod={PaymentMethod.Bold} shippingProvider={ShippingProvider.ENVIOCLICK} loading={false} variant="card" onTransition={vi.fn()} />
      <StatusActions status={OrderStatus.PAID} type={OrderType.STANDARD} paymentMethod={PaymentMethod.Bold} shippingProvider={ShippingProvider.ENVIOCLICK} loading={false} variant="care" onTransition={vi.fn()} />
      <ShippingInfo shipping={shipping} />
    </ViewerAccessProvider>,
  );
}

/**
 * «Marcar como enviado» se veía activo para la cuenta de solo lectura (el
 * servidor lo rechazaba). Ahora las acciones que cambian el pedido están
 * apagadas de verdad para ese rol, como en las demás pantallas.
 */
describe("acciones del pedido para la cuenta de solo lectura", () => {
  it("solo lectura: transiciones, actualizar rastreo y cancelar envío apagados", () => {
    renderAs("viewer");
    expect(screen.getByRole("button", { name: "Marcar como enviado" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cancelar y devolver/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actualizar rastreo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cancelar envío/ })).toBeDisabled();
  });

  it("dueña: las mismas acciones siguen activas", () => {
    renderAs("owner");
    expect(screen.getByRole("button", { name: "Marcar como enviado" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Cancelar y devolver/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Actualizar rastreo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Cancelar envío/ })).toBeEnabled();
  });
});
