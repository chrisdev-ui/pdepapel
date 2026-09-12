// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShipmentMobileCard } from "@/app/(dashboard)/[storeId]/(routes)/envios/components/shipment-mobile-card";
import type { ShipmentColumn } from "@/app/(dashboard)/[storeId]/(routes)/envios/components/columns";
import { formatShortDate } from "@/lib/shipment-views";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

const shipment = (overrides: Partial<ShipmentColumn> = {}): ShipmentColumn => ({
  id: "s1",
  storeId: "store-1",
  trackingCode: "GUIA-1",
  trackingUrl: null,
  carrierName: "COORDINADORA",
  courier: null,
  cost: 12500,
  status: ShippingStatus.InTransit,
  provider: ShippingProvider.ENVIOCLICK,
  envioClickIdOrder: 1,
  guideUrl: null,
  estimatedDeliveryDate: new Date("2026-09-15T16:00:00Z"),
  createdAt: new Date("2026-09-10T15:00:00Z"),
  updatedAt: new Date(),
  firstEventAt: new Date("2026-09-11T15:00:00Z"),
  order: {
    id: "o1",
    orderNumber: "ORD-1",
    fullName: "María Pérez",
    phone: "3001234567",
    address: "Cra 1 # 2-3",
    city: "Cali",
    status: OrderStatus.PAID,
    type: OrderType.STANDARD,
    paymentMethod: PaymentMethod.Bold,
  },
  ...overrides,
});

describe("ShipmentMobileCard", () => {
  it("shows the arrival date, the cost and a direct link to the guide", () => {
    render(<ShipmentMobileCard shipment={shipment({ guideUrl: "https://guias.test/g1.pdf", trackingUrl: "https://rastreo.test/1" })} storeId="store-1" />);
    expect(screen.getByText("Llega")).toBeInTheDocument();
    expect(screen.getByText(formatShortDate("2026-09-15T16:00:00Z")!)).toBeInTheDocument();
    expect(screen.getByText("Costo")).toBeInTheDocument();
    expect(screen.getByText(/12\.500/)).toBeInTheDocument();
    expect(screen.getByText("En tránsito")).toBeInTheDocument();
    // La guía PDF manda sobre el rastreo cuando hay ambas.
    const link = screen.getByRole("link", { name: /Ver guía/ });
    expect(link).toHaveAttribute("href", "https://guias.test/g1.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("link", { name: /Rastrear/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Ver envío" })).toHaveAttribute("href", "/store-1/pedidos/o1#envio");
  });

  it("falls back to the tracking link and shows dashes when there is no date or cost", () => {
    render(<ShipmentMobileCard shipment={shipment({ trackingUrl: "https://rastreo.test/1", estimatedDeliveryDate: null, cost: null, status: ShippingStatus.Preparing })} storeId="store-1" />);
    expect(screen.getByRole("link", { name: /Rastrear/ })).toHaveAttribute("href", "https://rastreo.test/1");
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("Preparando")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preparar envío" })).toBeInTheDocument();
  });

  it("offers no direct link without guide or tracking URL and labels pickup at the store", () => {
    render(<ShipmentMobileCard shipment={shipment({ provider: ShippingProvider.NONE, carrierName: null, courier: "Recogida" })} storeId="store-1" />);
    expect(screen.queryByRole("link", { name: /Ver guía|Rastrear/ })).toBeNull();
    expect(screen.getByText(/Recoge en tienda/)).toBeInTheDocument();
  });
});
