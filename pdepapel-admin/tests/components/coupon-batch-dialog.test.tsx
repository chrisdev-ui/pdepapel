// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CouponBatchDialog } from "@/app/(dashboard)/[storeId]/(routes)/cupones/components/coupon-batch-dialog";

const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh, back: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("axios", () => ({ default: { post: mocks.post } }));

describe("CouponBatchDialog", () => {
  beforeAll(() => {
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { value: () => false, configurable: true },
      releasePointerCapture: { value: () => undefined, configurable: true },
      setPointerCapture: { value: () => undefined, configurable: true },
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined, configurable: true });
  });
  afterEach(cleanup);

  it("defaults to Porcentaje and empties the amount when the type changes", async () => {
    render(<CouponBatchDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Crear lote de cupones" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Porcentaje" })).toHaveAttribute("aria-checked", "true"));
    fireEvent.change(screen.getByPlaceholderText("10"), { target: { value: "15" } });
    expect(screen.getByPlaceholderText("10")).toHaveValue(15);
    fireEvent.click(screen.getByRole("radio", { name: "Monto fijo" }));
    expect(screen.getByRole("radio", { name: "Monto fijo" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByPlaceholderText("$ 10.000")).toHaveDisplayValue("");
    expect(screen.getByText(/20 cupones de —/)).toBeInTheDocument();
  });
});
