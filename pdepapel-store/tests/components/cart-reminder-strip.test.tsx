/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ track: vi.fn(), pathname: "/" }));

vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: mocks.track }));
vi.mock("@/hooks/use-storefront-pathname", () => ({ useStorefrontPathname: () => mocks.pathname }));
vi.mock("@/hooks/use-cart", () => ({
  useCart: (selector: (state: { items: unknown[] }) => unknown) =>
    selector({ items: [{ id: "p1", name: "Agenda", price: "12000", quantity: 1 }] }),
}));

import { CartReminderStrip } from "@/components/cart-reminder-strip";

describe("CartReminderStrip", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mocks.track.mockClear();
    mocks.pathname = "/";
  });
  afterEach(cleanup);

  it("solo cuenta la vista cuando la franja se ve, en Inicio", () => {
    mocks.pathname = "/producto/agenda";
    render(<CartReminderStrip />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("en Inicio se ve y se cuenta una sola vez por visita", () => {
    const first = render(<CartReminderStrip />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith("cart_reminder_view", { item_count: 1 });
    first.unmount();

    // Volver a Inicio en la misma visita (otra carga) no suma otra vista.
    render(<CartReminderStrip />);
    expect(mocks.track).toHaveBeenCalledTimes(1);
  });
});
