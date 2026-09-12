// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lazy, Suspense, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeTypeDeletion, TypeForm } from "@/app/(dashboard)/[storeId]/(routes)/tipos/[typeId]/components/type-form";
import type { TypeDetail } from "@/app/(dashboard)/[storeId]/(routes)/tipos/[typeId]/server/get-type";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", typeId: "new" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
}));
// `next/dynamic` fuera de Next: cargamos el selector real de forma perezosa.
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) => {
    const Lazy = lazy(loader);
    const Dynamic = (props: Record<string, unknown>) => (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
    return Dynamic;
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({ useFormPersist: () => ({ clearStorage: vi.fn() }) }));
vi.mock("@/hooks/use-form-validation-toast", () => ({ useFormValidationToast: () => undefined }));
vi.mock("axios", () => ({
  default: {
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.del,
    isAxiosError: (error: unknown) => typeof error === "object" && error !== null && "isAxiosError" in error,
  },
}));

const storedType: TypeDetail = {
  id: "type-1",
  name: "Útiles",
  slug: "utiles",
  icon: "paperclip",
  iconSvg: null,
  isArchived: false,
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  categoriesCount: 13,
  activeCategoriesCount: 12,
  categoriesWithProducts: 9,
  productsCount: 197,
  categoryPreview: [
    { id: "cat-1", name: "Cintas", isArchived: false, productsCount: 20 },
    { id: "cat-2", name: "Tijeras", isArchived: true, productsCount: 0 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ data: {} });
  mocks.patch.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe("describeTypeDeletion", () => {
  it("refuses with the cascade copy when a subcategory has products", () => {
    const result = describeTypeDeletion({ categoriesCount: 13, categoriesWithProducts: 2 });
    expect(result.canDelete).toBe(false);
    expect(result.description).toBe(
      "Eliminar borra también sus 13 subcategorías y solo es posible cuando ninguna tiene productos. Con productos, archívala.",
    );
  });

  it("allows deletion without subcategories or when none has products, naming the cascade", () => {
    expect(describeTypeDeletion({ categoriesCount: 0, categoriesWithProducts: 0 }).canDelete).toBe(true);
    const cascade = describeTypeDeletion({ categoriesCount: 1, categoriesWithProducts: 0 });
    expect(cascade.canDelete).toBe(true);
    expect(cascade.confirmDescription).toContain("borra también sus 1 subcategoría");
  });
});

describe("TypeForm", () => {
  it("renders the sections, the summary line and the usage aside for an existing category", async () => {
    render(<TypeForm initialData={storedType} aiIconConfigured />);

    expect(screen.getByRole("heading", { level: 1, name: "Útiles" })).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Útiles · 13 subcategorías · 197 productos · /tienda?typeId=utiles")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Datos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Icono" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Uso" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Archivar o eliminar" })).toBeInTheDocument();
    expect(screen.getByText("Subcategorías activas").nextElementSibling).toHaveTextContent("12");
    expect(screen.getByRole("link", { name: "Cintas" })).toHaveAttribute("href", "/store-1/categorias/cat-1");

    // The real picker loads lazily and reflects the saved Lucide icon.
    expect(await screen.findByRole("button", { name: "Útiles (paperclip)" })).toHaveAttribute("aria-pressed", "true");
  });

  it("refuses deletion with the cascade copy when subcategories have products and blocks archiving while they are active", () => {
    render(<TypeForm initialData={storedType} aiIconConfigured />);

    expect(
      screen.getByText("Eliminar borra también sus 13 subcategorías y solo es posible cuando ninguna tiene productos. Con productos, archívala."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archivar" })).toBeDisabled();
    expect(screen.getByText("Tiene 12 subcategorías activas; archívalas primero.")).toBeInTheDocument();
  });

  it("asks before leaving with unsaved changes", async () => {
    render(<TypeForm initialData={storedType} aiIconConfigured />);

    fireEvent.change(screen.getByLabelText("Nombre", { exact: false }), { target: { value: "Útiles escolares" } });
    fireEvent.click(screen.getByRole("button", { name: "Volver a Atributos" }));

    expect(await screen.findByText("¿Salir sin guardar?")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("creates a category sending the chosen Lucide icon and no custom SVG, then returns to the hub tab", async () => {
    render(<TypeForm initialData={null} aiIconConfigured={false} />);

    fireEvent.change(screen.getByLabelText("Nombre", { exact: false }), { target: { value: "📒 Cuadernos" } });
    fireEvent.click(await screen.findByRole("button", { name: "Cuadernos (notebook-pen)" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear categoría" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/types", { name: "Cuadernos", icon: "notebook-pen", iconSvg: null });
    expect(mocks.push).toHaveBeenCalledWith("/store-1/atributos?tab=categorias");
    expect(screen.getByText("La generación con IA no está configurada.")).toBeInTheDocument();
  });

  it("does not submit without a name and shows the Spanish message", async () => {
    render(<TypeForm initialData={null} aiIconConfigured />);
    fireEvent.click(screen.getByRole("button", { name: "Crear categoría" }));
    expect(await screen.findByText("Escribe el nombre de la categoría")).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
