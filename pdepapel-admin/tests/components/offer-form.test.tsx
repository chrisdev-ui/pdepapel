// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OfferForm } from "@/app/(dashboard)/[storeId]/(routes)/ofertas/[offerId]/components/offer-form";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), toast: vi.fn(), get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", offerId: "o1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
}));
vi.mock("next/image", () => ({ default: (props: React.ComponentProps<"img">) => <img {...props} alt={props.alt ?? ""} /> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({ useFormPersist: () => ({ clearStorage: vi.fn() }) }));
vi.mock("@/hooks/use-form-validation-toast", () => ({ useFormValidationToast: () => undefined }));
vi.mock("axios", () => ({ default: { get: mocks.get, patch: mocks.patch, post: mocks.post, put: mocks.put, delete: mocks.del } }));

const termo = { id: "p1", name: "Termo lila", sku: "T-1", price: 60000, stock: 3, categoryId: "c1", categoryName: "Termos", productGroupId: "g1", imageUrl: null, overlaps: [] };
const cuaderno = { id: "p3", name: "Cuaderno", sku: "C-1", price: 8000, stock: 10, categoryId: "c2", categoryName: "Cuadernos", productGroupId: null, imageUrl: null, overlaps: [] };
const agenda = { id: "p4", name: "Agenda A5", sku: "A-1", price: 23000, stock: 2, categoryId: "c2", categoryName: "Agendas", productGroupId: null, imageUrl: null, overlaps: [{ offerId: "o9", name: "Hasta agotar", type: "FIXED" as const, amount: 5000, after: 18000 }] };

const picker = {
  categories: [
    { id: "c1", name: "Termos", typeName: "Accesorios", productCount: 2 },
    { id: "c2", name: "Cuadernos", typeName: "Papelería", productCount: 1 },
  ],
  productGroups: [{ id: "g1", name: "Termo Owala", productCount: 2 }],
  selectedProducts: [termo],
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

const summary = { affected: 1, sellable: 1, byProducts: 1, byCategories: 0, byGroups: 0, overlaps: { count: 0, names: [] }, free: { count: 0, names: [] }, sample: { name: "Termo lila", price: 60000 } };

describe("OfferForm", () => {
  beforeAll(() => {
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { value: () => false, configurable: true },
      releasePointerCapture: { value: () => undefined, configurable: true },
      setPointerCapture: { value: () => undefined, configurable: true },
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined, configurable: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ data: { products: [termo, cuaderno, agenda], hasMore: false } });
    mocks.post.mockImplementation(async (url: string) => (url.endsWith("/scope-summary") ? { data: summary } : { data: {} }));
    mocks.patch.mockResolvedValue({ data: {} });
  });
  afterEach(cleanup);

  it("shows the chosen products as chips, searches the API and flags overlaps and free products", async () => {
    render(<OfferForm initialData={offer} picker={picker} />);
    expect(screen.getByRole("heading", { name: /A qué aplica/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar Termo lila" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Cuaderno" })).toBeInTheDocument());
    expect(mocks.get).toHaveBeenCalledWith("/api/store-1/offers/scope-search", { params: { q: "", agotados: "0", excluir: "o1" } });
    // $ 9.000 fijos sobre un cuaderno de $ 8.000 lo dejarían gratis: no se puede marcar.
    expect(screen.getByRole("checkbox", { name: "Cuaderno" })).toBeDisabled();
    expect(screen.getByText("Quedaría en $ 0")).toBeInTheDocument();
    expect(screen.getByText(/Ya en «Hasta agotar»/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1 producto con precio rebajado")).toBeInTheDocument());
  });

  it("adds a searched product and sends the merged scope", async () => {
    render(<OfferForm initialData={offer} picker={picker} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Agenda A5" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "Agenda A5" }));
    expect(screen.getByRole("button", { name: "Quitar Agenda A5" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    const [url, payload] = mocks.patch.mock.calls[0];
    expect(url).toBe("/api/store-1/offers/o1");
    expect(payload.productIds.sort()).toEqual(["p1", "p4"]);
    expect(payload).toMatchObject({ label: null, startDate: "2026-09-08", endDate: "2026-12-30" });
    expect(mocks.push).toHaveBeenCalledWith("/store-1/promociones");
  });

  it("refuses to save once the last target is removed", async () => {
    render(<OfferForm initialData={offer} picker={picker} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Termo lila" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Elige al menos un producto, subcategoría o grupo"));
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("empties the amount when the discount type changes", async () => {
    render(<OfferForm initialData={offer} picker={picker} />);
    expect(screen.getByPlaceholderText("$ 5.000")).toHaveDisplayValue(/9\.000/);
    fireEvent.click(screen.getByRole("radio", { name: "Porcentaje" }));
    expect(screen.getByPlaceholderText("10")).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.getByText("Escribe el descuento")).toBeInTheDocument());
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("una semilla de productos preelegidos no se anuncia como copia", () => {
    // `?productos=` trae el alcance y nada más: nombre vacío, descuento por
    // decidir y el título de una oferta nueva, no de una copia.
    render(<OfferForm initialData={null} picker={picker} seed={{ origin: "preselection", name: "", label: null, productIds: ["p1"], categoryIds: [], productGroupIds: [] }} />);
    expect(screen.getByRole("heading", { name: "Nueva oferta" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nueva oferta (copia)" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar Termo lila" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("10")).toHaveValue(null);
  });

  it("starts a duplicate with the source scope and creates a new offer", async () => {
    const user = userEvent.setup();
    render(<OfferForm initialData={null} picker={picker} seed={{ origin: "duplicate", name: "Hasta agotar (copia)", label: "ÚLTIMAS", type: "FIXED", amount: 9000, productIds: ["p1"], categoryIds: [], productGroupIds: [] }} />);
    expect(screen.getByRole("heading", { name: "Nueva oferta (copia)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar Termo lila" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hasta agotar (copia)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Selecciona un rango de fechas" }));
    await user.click(await screen.findByRole("button", { name: "Este mes" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear oferta" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/offers", expect.objectContaining({ name: "Hasta agotar (copia)", label: "ÚLTIMAS", productIds: ["p1"] })));
  });
});
