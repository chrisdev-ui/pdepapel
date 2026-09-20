// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Crear una tienda deja de ser un clic suelto: la opción solo se ve con
 * autorización explícita del dueño, y aun así se confirma con el nombre a la
 * vista antes de crear nada.
 */
const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn(), onOpen: vi.fn(), push: vi.fn() }));

vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  usePathname: () => "/store-1",
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { StoreModal } from "@/components/modals/store-modal";
import { StoreSwitcher } from "@/components/store-switcher";

const stores = [
  { id: "store-1", name: "Papelería P de Papel" },
  { id: "store-2", name: "Segunda" },
] as never[];

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("selector de tiendas", () => {
  it("no ofrece crear una tienda sin autorización explícita", async () => {
    render(<StoreSwitcher items={stores} />);
    fireEvent.click(screen.getByRole("combobox"));
    // La lista se abre (la segunda tienda solo existe dentro del desplegable).
    expect(await screen.findByText("Segunda")).toBeInTheDocument();
    expect(screen.queryByText("Crea una tienda")).not.toBeInTheDocument();
  });

  it("la ofrece a quien el dueño autorizó", async () => {
    render(<StoreSwitcher items={stores} canCreateStore />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Crea una tienda")).toBeInTheDocument();
  });
});

describe("crear una tienda", () => {
  it("pide confirmación con el nombre a la vista y solo entonces la crea", async () => {
    mocks.post.mockResolvedValue({ data: { id: "store-nueva" } });
    const { useStoreModal } = await import("@/hooks/use-store-modal");
    useStoreModal.setState({ isOpen: true });
    render(<StoreModal />);

    fireEvent.change(screen.getByPlaceholderText("Nombre de la tienda"), { target: { value: "  Tienda nueva  " } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("¿Crear la tienda «Tienda nueva»?")).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sí, crear la tienda" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/stores", { name: "Tienda nueva" }));
  });

  it("cancelar la confirmación no crea nada", async () => {
    const { useStoreModal } = await import("@/hooks/use-store-modal");
    useStoreModal.setState({ isOpen: true });
    render(<StoreModal />);

    fireEvent.change(screen.getByPlaceholderText("Nombre de la tienda"), { target: { value: "Otra" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByText("¿Crear la tienda «Otra»?")).not.toBeInTheDocument());
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
