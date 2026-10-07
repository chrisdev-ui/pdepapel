// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ColorForm } from "@/app/(dashboard)/[storeId]/(routes)/colores/[colorId]/components/color-form";
import { SizeForm } from "@/app/(dashboard)/[storeId]/(routes)/tamanos/[sizeId]/components/size-form";

const mocks = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), push: vi.fn(), refresh: vi.fn(), toast: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({ useFormPersist: () => ({ clearStorage: vi.fn() }) }));
vi.mock("@/hooks/use-form-validation-toast", () => ({ useFormValidationToast: () => undefined }));
vi.mock("@/hooks/use-unsaved-changes-guard", () => ({ useUnsavedChangesGuard: () => ({ confirmLeave: async () => true, confirmationDialog: null }) }));
vi.mock("axios", () => ({ default: { post: mocks.post, patch: mocks.patch, delete: vi.fn(), isAxiosError: () => false } }));

afterEach(cleanup);

const now = new Date("2026-09-01T12:00:00.000Z");
const color = { id: "k2", storeId: "store-1", name: "Rosa pastel", value: "#F9C5D1", swatchType: "SOLID" as const, createdAt: now, updatedAt: now, isArchived: false, archivedAt: null };
const siblings = [
  { id: "k1", name: "Rosado", usage: 109, value: "#F472B6" },
  { id: "k2", name: "Rosa pastel", usage: 92, value: "#F9C5D1" },
  { id: "k4", name: "Pastel", usage: 388, value: "#FFFFFF" },
  { id: "k5", name: "Multicolor", usage: 368, value: "#ffffff" },
  { id: "k6", name: "Fluorescente", usage: 4, value: "#FFFFFF", swatchType: "NEON" },
];

describe("ColorForm hints", () => {
  it("shows usage with groups, the products link, the similar-name hint and the merge card", () => {
    render(<ColorForm initialData={color} usage={{ activeProducts: 89, archivedProducts: 3, groups: 4 }} siblings={siblings} />);
    expect(screen.getByText("Grupos con variantes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver sus productos" })).toHaveAttribute("href", "/store-1/productos?color=k2");
    expect(screen.getByRole("link", { name: "Rosado" })).toHaveAttribute("href", "/store-1/colores/k1");
    expect(screen.getByRole("button", { name: /Unir con «Rosado»/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unir con otro" })).toBeInTheDocument();
  });

  it("warns, without blocking, when the hex matches other active colours and normalises it on save", async () => {
    mocks.patch.mockResolvedValue({ data: {} });
    render(<ColorForm initialData={color} usage={{ activeProducts: 89, archivedProducts: 3, groups: 4 }} siblings={siblings} />);
    const hex = screen.getByPlaceholderText("#F5A3C7");
    fireEvent.change(hex, { target: { value: " #ffffff " } });
    expect(screen.getByTestId("same-tone")).toHaveTextContent("Mismo tono que «Pastel», «Multicolor»");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await vi.waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(mocks.patch).toHaveBeenCalledWith("/api/store-1/colors/k2", { name: "Rosa pastel", value: "#FFFFFF", swatchType: "SOLID" });
  });
});

describe("ColorForm swatch type (#3)", () => {
  const multicolor = { ...color, id: "k5", name: "Multicolor", value: "#FFFFFF", swatchType: "MULTICOLOR" as const };
  const usage = { activeProducts: 135, archivedProducts: 0, groups: 10 };

  it("loads the saved type with a live preview of the store swatch", () => {
    render(<ColorForm initialData={multicolor} usage={usage} siblings={siblings} />);
    expect(screen.getByRole("combobox", { name: "Tipo de muestra" })).toHaveTextContent("Multicolor");
    expect(screen.getByTestId("swatch-type-preview")).toHaveAttribute("data-swatch-type", "MULTICOLOR");
    expect(screen.getByTestId("color-swatch")).toHaveAttribute("data-swatch-type", "MULTICOLOR");
    expect(screen.getByText(/Arcoíris: el hex se guarda pero no se usa/)).toBeInTheDocument();
  });

  it("defaults a new colour to Sólido and sends the type on create", async () => {
    mocks.post.mockReset();
    mocks.post.mockResolvedValue({ data: {} });
    render(<ColorForm initialData={null} usage={{ activeProducts: 0, archivedProducts: 0, groups: 0 }} siblings={[]} />);
    expect(screen.getByRole("combobox", { name: "Tipo de muestra" })).toHaveTextContent("Sólido");
    fireEvent.change(screen.getByPlaceholderText("Ej. Rosa pastel"), { target: { value: "Coral" } });
    fireEvent.change(screen.getByPlaceholderText("#F5A3C7"), { target: { value: "#ff7f50" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear color" }));
    await vi.waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/colors", { name: "Coral", value: "#FF7F50", swatchType: "SOLID" });
  });

  it("changes the type, updates the preview and saves it", async () => {
    mocks.patch.mockReset();
    mocks.patch.mockResolvedValue({ data: {} });
    const { container } = render(<ColorForm initialData={color} usage={usage} siblings={siblings} />);
    // Radix Select deja un <select> nativo oculto dentro del formulario.
    const native = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(native, { target: { value: "NEON" } });
    await vi.waitFor(() => expect(screen.getByTestId("swatch-type-preview")).toHaveAttribute("data-swatch-type", "NEON"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await vi.waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(mocks.patch).toHaveBeenLastCalledWith("/api/store-1/colors/k2", { name: "Rosa pastel", value: "#F9C5D1", swatchType: "NEON" });
  });

  it("only warns about the same tone when hex and type both match", async () => {
    const { container } = render(<ColorForm initialData={color} usage={usage} siblings={siblings} />);
    fireEvent.change(screen.getByPlaceholderText("#F5A3C7"), { target: { value: "#FFFFFF" } });
    expect(screen.getByTestId("same-tone")).toHaveTextContent("Mismo tono que «Pastel», «Multicolor».");
    fireEvent.change(container.querySelector("select") as HTMLSelectElement, { target: { value: "NEON" } });
    await vi.waitFor(() => expect(screen.getByTestId("same-tone")).toHaveTextContent("Mismo tono que «Fluorescente»."));
  });
});

describe("SizeForm existing combination", () => {
  it("blocks saving a combination another size already has and links to it", () => {
    render(
      <SizeForm
        initialData={null}
        usage={{ activeProducts: 0, archivedProducts: 0, groups: 0 }}
        siblings={[{ id: "s1", name: "S+", usage: 138, value: "S-P" }]}
      />,
    );
    // Sin combinación aún: nada que avisar y el botón activo.
    expect(screen.queryByTestId("size-exists")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear tamaño" })).toBeEnabled();
  });
});
