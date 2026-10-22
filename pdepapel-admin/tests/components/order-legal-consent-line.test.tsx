// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { OrderWorkspaceHeader } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-workspace-header";

const base = {
  id: "o1",
  orderNumber: "ORD-1",
  fullName: "Luisa Sánchez",
  phone: "3000000000",
  total: 15000,
  status: "PENDING",
  orderItems: [],
  createdAt: new Date("2026-10-22T15:00:00Z"),
} as never;

describe("línea de consentimiento en el pedido", () => {
  afterEach(() => cleanup());

  it("la dueña ve qué versión aceptó y cuándo", () => {
    render(<OrderWorkspaceHeader storeId="s1" order={{ ...(base as object), legalTermsVersion: "2026-10-21", legalPrivacyVersion: "2026-10-21", legalConsentAt: "2026-10-22T15:01:00Z", legalConsentChannel: "CHECKOUT" } as never} />);
    expect(screen.getByTestId("order-legal-consent")).toHaveTextContent(/Aceptó términos v2026-10-21 y privacidad v2026-10-21 el .+ \(checkout\)/);
  });

  it("sin consentimiento (panel, punto de venta, solo lectura sin los campos) no se pinta nada", () => {
    render(<OrderWorkspaceHeader storeId="s1" order={base} />);
    expect(screen.queryByTestId("order-legal-consent")).toBeNull();
  });
});
