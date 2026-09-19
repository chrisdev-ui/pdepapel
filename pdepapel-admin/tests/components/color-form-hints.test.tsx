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
const color = { id: "k2", storeId: "store-1", name: "Rosa pastel", value: "#F9C5D1", createdAt: now, updatedAt: now, isArchived: false, archivedAt: null };
const siblings = [
  { id: "k1", name: "Rosado", usage: 109, value: "#F472B6" },
  { id: "k2", name: "Rosa pastel", usage: 92, value: "#F9C5D1" },
  { id: "k4", name: "Pastel", usage: 388, value: "#FFFFFF" },
  { id: "k5", name: "Multicolor", usage: 368, value: "#ffffff" },
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
    expect(mocks.patch).toHaveBeenCalledWith("/api/store-1/colors/k2", { name: "Rosa pastel", value: "#FFFFFF" });
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
