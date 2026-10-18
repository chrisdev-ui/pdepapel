// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn() }));

vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/brands/brand-picker", () => ({
  BrandPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange("b-kiut")}>
      Elegir Kiut
    </button>
  ),
}));

import { BrandAssignDialog } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/brand-assign-dialog";

const products = [
  { id: "p1", name: "Cuaderno Kiut" },
  { id: "p2", name: "Agenda Kiut" },
];
const brands = [
  { id: "b-kiut", name: "Kiut", aliases: [], logoUrl: null, logoPermission: "UNKNOWN" as const, isArchived: false, parentBrandId: null, parentName: null },
];

type Body = { brandId: string | null; productIds: string[]; preview?: boolean };

describe("BrandAssignDialog", () => {
  beforeEach(() => {
    mocks.post.mockImplementation(async (_url: string, body: Body) => {
      if (!body.preview) return { data: { updatedProducts: body.productIds.length + 2 } };
      const withOther = body.productIds.includes("p2") ? [{ id: "p2", name: "Agenda Kiut", brandName: "Norma" }] : [];
      return { data: { requested: body.productIds.length, withOtherBrand: withOther, extraVariants: 2, groups: 1 } };
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the products that already have another brand unless they are ticked", async () => {
    const onDone = vi.fn();
    render(
      <BrandAssignDialog
        open
        mode="assign"
        storeId="store-1"
        products={products}
        brands={brands}
        onOpenChange={vi.fn()}
        onDone={onDone}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Elegir Kiut" }));

    const confirm = await screen.findByRole("button", { name: "Asignar Kiut a 1 producto" });
    expect(screen.getByText(/Cambian además 2 variantes/)).toBeTruthy();
    const checkbox = screen.getByRole("checkbox", { name: /Agenda Kiut/ }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const apply = mocks.post.mock.calls.find(([, body]) => !(body as Body).preview)!;
    expect(apply[0]).toBe("/api/store-1/brands/assign");
    expect(apply[1]).toEqual({ brandId: "b-kiut", productIds: ["p1"] });
  });

  it("changes a product with another brand once its box is ticked", async () => {
    render(
      <BrandAssignDialog
        open
        mode="assign"
        storeId="store-1"
        products={products}
        brands={brands}
        onOpenChange={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Elegir Kiut" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Agenda Kiut/ }));

    const confirm = await screen.findByRole("button", { name: "Asignar Kiut a 2 productos" });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith("/api/store-1/brands/assign", { brandId: "b-kiut", productIds: ["p1", "p2"] }),
    );
  });

  it("«Quitar marca» sends null for every selected product", async () => {
    const onDone = vi.fn();
    render(
      <BrandAssignDialog
        open
        mode="remove"
        storeId="store-1"
        products={products}
        brands={brands}
        onOpenChange={vi.fn()}
        onDone={onDone}
      />,
    );

    const confirm = await screen.findByRole("button", { name: "Quitar la marca a 2 productos" });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/brands/assign", { brandId: null, productIds: ["p1", "p2"] });
  });
});
