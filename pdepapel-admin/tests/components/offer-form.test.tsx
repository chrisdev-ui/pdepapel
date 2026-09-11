// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OfferForm } from "@/app/(dashboard)/[storeId]/(routes)/ofertas/[offerId]/components/offer-form";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), toast: vi.fn(), patch: vi.fn(), post: vi.fn(), del: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", offerId: "o1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
}));
vi.mock("next/image", () => ({ default: (props: React.ComponentProps<"img">) => <img {...props} alt={props.alt ?? ""} /> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({ useFormPersist: () => ({ clearStorage: vi.fn() }) }));
vi.mock("@/hooks/use-form-validation-toast", () => ({ useFormValidationToast: () => undefined }));
vi.mock("axios", () => ({ default: { patch: mocks.patch, post: mocks.post, delete: mocks.del } }));

const picker = {
  products: [
    { id: "p1", name: "Termo lila", price: 60000, stock: 3, categoryId: "c1", productGroupId: "g1", categoryName: "Termos", imageUrl: null },
    { id: "p2", name: "Termo negro", price: 60000, stock: 0, categoryId: "c1", productGroupId: "g1", categoryName: "Termos", imageUrl: null },
    { id: "p3", name: "Cuaderno", price: 8000, stock: 10, categoryId: "c2", productGroupId: null, categoryName: "Cuadernos", imageUrl: null },
  ],
  categories: [
    { id: "c1", name: "Termos", typeName: "Accesorios", productCount: 2 },
    { id: "c2", name: "Cuadernos", typeName: "Papelería", productCount: 1 },
  ],
  productGroups: [{ id: "g1", name: "Termo Owala", productCount: 2 }],
};

const offer = {
  id: "o1",
  storeId: "store-1",
  name: "Hasta agotar",
  label: null,
  type: "FIXED" as const,
  amount: 9000,
  startDate: new Date("2026-09-08T05:00:00.000Z"),
  endDate: new Date("2026-12-31T04:59:59.999Z"),
  isActive: true,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  products: [{ id: "op1", offerId: "o1", productId: "p1" }],
  categories: [],
  productGroups: [],
};

describe("OfferForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.patch.mockResolvedValue({ data: {} });
    mocks.post.mockResolvedValue({ data: {} });
  });
  afterEach(cleanup);

  it("marks the scope once, hides out-of-stock products until asked and warns about free products", () => {
    render(<OfferForm initialData={offer} picker={picker} />);

    expect(screen.getByRole("heading", { name: "Alcance" })).toBeInTheDocument();
    expect(screen.queryByText("Termo negro")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir agotados" }));
    expect(screen.getByText("Termo negro")).toBeInTheDocument();
    // $ 9.000 fijos sobre un cuaderno de $ 8.000 lo dejarían gratis: se avisa solo si está en el alcance.
    expect(screen.queryByText(/Dejaría en \$ 0/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cuaderno" }));
    expect(screen.getByText(/Dejaría en \$ 0 a Cuaderno/)).toBeInTheDocument();
  });

  it("merges 'select the filtered' into the existing selection instead of replacing it", async () => {
    render(<OfferForm initialData={offer} picker={picker} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Buscar en productos" }), { target: { value: "cuaderno" } });
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar los 1 filtrados" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    const payload = mocks.patch.mock.calls[0][1];
    expect(payload.productIds.sort()).toEqual(["p1", "p3"]);
    expect(payload).toMatchObject({ label: null, startDate: "2026-09-08", endDate: "2026-12-30" });
    expect(mocks.push).toHaveBeenCalledWith("/store-1/promociones");
  });

  it("refuses to save once the last target is removed", async () => {
    render(<OfferForm initialData={offer} picker={picker} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Termo lila" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Elige al menos un producto, grupo o subcategoría"));
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});
