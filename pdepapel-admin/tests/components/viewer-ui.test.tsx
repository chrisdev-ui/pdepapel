// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * La interfaz en una cuenta de solo lectura: aviso fijo arriba, sin botones
 * que escriben. Y, en la sesión de la dueña, ni rastro de todo esto.
 */
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/store-1",
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { HomeContentCellAction } from "@/app/(dashboard)/[storeId]/(routes)/contenido/components/home-content-columns";
import { AlertModal } from "@/components/modals/alert-modal";
import { ReadOnlyBanner } from "@/components/shell/read-only-banner";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";

const asViewer = (node: React.ReactNode) => render(<ViewerAccessProvider role="viewer">{node}</ViewerAccessProvider>);
const asOwner = (node: React.ReactNode) => render(<ViewerAccessProvider role="owner">{node}</ViewerAccessProvider>);

afterEach(cleanup);

describe("aviso de solo lectura", () => {
  it("se muestra a la cuenta de solo lectura y no se puede cerrar", () => {
    asViewer(<ReadOnlyBanner />);
    const banner = screen.getByTestId("read-only-banner");
    expect(banner).toHaveTextContent("Solo lectura.");
    expect(banner).toHaveTextContent("no cambiar nada");
    // No hay forma de cerrarlo.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("la dueña no lo ve", () => {
    asOwner(<ReadOnlyBanner />);
    expect(screen.queryByTestId("read-only-banner")).not.toBeInTheDocument();
  });

  it("fuera del panel tampoco aparece", () => {
    render(<ReadOnlyBanner />);
    expect(screen.queryByTestId("read-only-banner")).not.toBeInTheDocument();
  });
});

describe("confirmación destructiva", () => {
  const modal = (
    <AlertModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} loading={false} title="¿Eliminar?" confirmLabel="Sí, eliminar" />
  );

  it("queda apagada en una cuenta de solo lectura", () => {
    asViewer(modal);
    expect(screen.getByRole("button", { name: "Sí, eliminar" })).toBeDisabled();
  });

  it("la dueña la usa igual que siempre", () => {
    asOwner(modal);
    expect(screen.getByRole("button", { name: "Sí, eliminar" })).toBeEnabled();
  });
});

describe("acciones de fila", () => {
  const row = { id: "h-1", kind: "banner", title: "Portada", isActive: true } as never;

  it("una cuenta de solo lectura ve «Ver», no «Editar»", async () => {
    asViewer(<HomeContentCellAction data={row} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Abrir menú" }), { key: "Enter" });
    expect(await screen.findByText("Ver")).toBeInTheDocument();
    expect(screen.queryByText("Editar")).not.toBeInTheDocument();
  });

  it("la dueña sigue viendo «Editar»", async () => {
    asOwner(<HomeContentCellAction data={row} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Abrir menú" }), { key: "Enter" });
    expect(await screen.findByText("Editar")).toBeInTheDocument();
  });
});
