// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CouponForm } from "@/app/(dashboard)/[storeId]/(routes)/cupones/[couponId]/components/coupon-form";
import type { CouponDetail } from "@/lib/coupon-availability";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", couponId: "c1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({ useFormPersist: () => ({ clearStorage: vi.fn() }) }));
vi.mock("@/hooks/use-form-validation-toast", () => ({ useFormValidationToast: () => undefined }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/cupones/server/utils", () => ({ generateUniqueCouponCode: vi.fn() }));
vi.mock("axios", () => ({ default: { patch: mocks.patch, post: mocks.post, put: mocks.put, delete: mocks.del } }));

const coupon: CouponDetail = {
  id: "c1",
  storeId: "store-1",
  code: "SOLARIS1ANO",
  type: "PERCENTAGE",
  amount: 10,
  startDate: new Date("2026-09-01T05:00:00.000Z"),
  endDate: new Date("2026-10-01T04:59:59.999Z"),
  maxUses: 50,
  usedCount: 1,
  isActive: true,
  minOrderValue: 20000,
  isWelcomeBenefit: false,
  createdAt: new Date("2026-08-30T15:00:00.000Z"),
  updatedAt: new Date("2026-08-30T15:00:00.000Z"),
  usage: { used: 1, reserved: 2, limit: 50, remaining: 47, exhausted: false },
  ordersCount: 3,
  recentOrders: [
    { id: "o1", orderNumber: "4871", status: "PAID", paidAt: new Date("2026-09-10T15:00:00.000Z"), total: 40500, couponDiscount: 4500, createdAt: new Date("2026-09-10T15:00:00.000Z") },
    { id: "o2", orderNumber: "4882", status: "PENDING", paidAt: null, total: 30000, couponDiscount: 3000, createdAt: new Date("2026-09-11T15:00:00.000Z") },
  ],
};

describe("CouponForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.patch.mockResolvedValue({ data: {} });
  });
  afterEach(cleanup);

  it("shows the real usage, the reservations, the recent orders and blocks deleting a referenced coupon", () => {
    render(<CouponForm initialData={coupon} />);

    expect(screen.getByRole("heading", { name: "Editar cupón" })).toBeInTheDocument();
    expect(screen.getByText("de 50 usos")).toBeInTheDocument();
    expect(screen.getByText(/47 disponibles/)).toBeInTheDocument();
    expect(screen.getByText(/2 reservados en pedidos pendientes/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedido #4871" })).toHaveAttribute("href", "/store-1/pedidos/o1");
    expect(screen.getByText("Reservado")).toBeInTheDocument();
    expect(screen.getByText(/3 pedidos lo referencian/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eliminar/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Desactivar/ })).toBeEnabled();
  });

  it("submits calendar days and the usage limit, then returns to the coupons tab", async () => {
    render(<CouponForm initialData={coupon} />);

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    const [url, payload] = mocks.patch.mock.calls[0];
    expect(url).toBe("/api/store-1/coupons/c1");
    expect(payload).toMatchObject({ code: "SOLARIS1ANO", type: "PERCENTAGE", amount: 10, maxUses: 50, minOrderValue: 20000, startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(mocks.push).toHaveBeenCalledWith("/store-1/promociones?tab=cupones");
  });

  it("sends a null limit when the coupon has no usage cap", async () => {
    render(<CouponForm initialData={{ ...coupon, maxUses: null, usage: { ...coupon.usage, limit: null, remaining: null } }} />);

    expect(screen.getByText("usos, sin límite")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch.mock.calls[0][1].maxUses).toBeNull();
  });
});
