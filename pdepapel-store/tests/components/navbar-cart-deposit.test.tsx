/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sheet } from "@/components/ui/sheet";
import type { Product } from "@/types";

const calendar = {
  id: "cal",
  slug: "calendario",
  name: "Calendario de adviento",
  price: "160000",
  quantity: 2,
  stock: 0,
  images: [],
  presales: [{ id: "ps", expectedArrivalAt: null, unitLimit: null, committedUnits: 0, paymentMode: "DEPOSIT", depositType: "FIXED", depositValue: 30000 }],
} as unknown as Product;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-cart", () => ({ useCart: () => ({ items: [calendar], removeAll: vi.fn(), removeItem: vi.fn() }) }));
vi.mock("@/components/account-prompt", () => ({ AccountPrompt: () => null }));
vi.mock("@/components/ui/cloudinary-image", () => ({ CloudinaryImage: ({ alt }: { alt: string }) => <img alt={alt} /> }));
vi.mock("@/lib/customer-analytics", () => ({ toAnalyticsItem: vi.fn(() => ({})), trackCustomerEvent: vi.fn() }));

import { NavbarCartContent } from "@/components/navbar-cart-content";
import { StorefrontSettingsProvider } from "@/providers/storefront-settings-provider";

afterEach(cleanup);

describe("panel del carrito con una preventa con anticipo", () => {
  it("muestra el total del producto, lo que se paga hoy y el saldo; sin barra de envío gratis", () => {
    render(
      <StorefrontSettingsProvider value={{ freeShippingThreshold: 120000, deliveryEstimate: null, bankTransfer: { account: null, breBKey: null, whatsappNumber: null } }}>
        <Sheet open>
          <NavbarCartContent onClose={vi.fn()} />
        </Sheet>
      </StorefrontSettingsProvider>,
    );
    const summary = screen.getByTestId("drawer-deposit-summary");
    expect(summary.textContent!.replace(/\s+/g, " ")).toContain("Total del producto$ 320.000");
    expect(summary.textContent!.replace(/\s+/g, " ")).toContain("Pagas hoy (anticipo)$ 60.000");
    expect(summary.textContent!.replace(/\s+/g, " ")).toContain("Saldo al llegar$ 260.000 + envío");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
