// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShippingInfo } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/shipping-info";

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", orderId: "order-1" }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("axios", () => ({ default: { post: vi.fn(), delete: vi.fn() } }));

const quotedShipping = {
  id: "ship-1",
  provider: "ENVIOCLICK",
  status: "Preparing" as const,
  carrierName: "ENVIA",
  courier: "ENVIA",
  envioClickIdRate: 4242,
  productName: "Normal",
  deliveryDays: 3,
  flete: 9074,
  minimumInsurance: 650,
  cost: 0,
};

afterEach(() => cleanup());

describe("ShippingInfo cost block", () => {
  it("shows the Gratis badge instead of a bare zero for a free-shipping order", () => {
    render(
      <ShippingInfo
        shipping={quotedShipping}
        orderStatus="PENDING"
        freeShipping
      />,
    );

    expect(screen.getByText("Costo de envío")).toBeTruthy();
    expect(screen.getByText("Gratis")).toBeTruthy();
    expect(screen.queryByText(/^\$?\s?0$/)).toBeNull();
    // The carrier's real freight stays visible for the admin.
    expect(screen.getByText("$ 9.074")).toBeTruthy();
  });

  it("prints the charged amount when shipping is not free", () => {
    render(
      <ShippingInfo
        shipping={{ ...quotedShipping, cost: 7280 }}
        orderStatus="PENDING"
      />,
    );

    expect(screen.getByText("$ 7.280")).toBeTruthy();
    expect(screen.queryByText("Gratis")).toBeNull();
  });
});
