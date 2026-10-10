// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Configuración › Tienda › «Correos del equipo y de avisos». */
const mocks = vi.hoisted(() => ({
  patch: vi.fn(async (_url: string, body: { excludedCustomerEmails: string; adminNotificationEmails: string }) => ({
    data: {
      excludedCustomerEmails: body.excludedCustomerEmails.split("\n").filter(Boolean).map((line) => line.trim().toLowerCase()),
      adminNotificationEmails: [],
    },
  })),
  toast: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("axios", () => ({ default: { patch: mocks.patch, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

import { EmailListsPanel } from "@/app/(dashboard)/[storeId]/(routes)/configuracion/components/email-lists-panel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("correos del equipo y de avisos", () => {
  it("muestra lo guardado, una dirección por línea, y explica qué hace cada lista", () => {
    render(<EmailListsPanel excludedCustomerEmails={["a@ejemplo.test", "b@ejemplo.test"]} adminNotificationEmails={[]} hasStoreEmail />);
    expect(screen.getByLabelText("Correos del equipo (no son clientas)")).toHaveValue("a@ejemplo.test\nb@ejemplo.test");
    expect(screen.getByLabelText("Correos que reciben los avisos del panel")).toHaveValue("");
    expect(screen.getByText(/Vacía, los avisos van al correo de la tienda/)).toBeInTheDocument();
    expect(screen.getByText(/nunca se publican en la tienda/)).toBeInTheDocument();
  });

  it("guarda las dos listas en su propia ruta y muestra lo que quedó", async () => {
    render(<EmailListsPanel excludedCustomerEmails={[]} adminNotificationEmails={[]} hasStoreEmail={false} />);
    fireEvent.change(screen.getByLabelText("Correos del equipo (no son clientas)"), { target: { value: "Equipo@Ejemplo.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar correos" }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/api/store-1/settings/emails", {
      excludedCustomerEmails: "Equipo@Ejemplo.test",
      adminNotificationEmails: "",
    }));
    await waitFor(() => expect(screen.getByLabelText("Correos del equipo (no son clientas)")).toHaveValue("equipo@ejemplo.test"));
    expect(mocks.toast).toHaveBeenCalledWith({ description: "Correos guardados", variant: "success" });
    expect(screen.getByText(/Vacía y sin correo de la tienda, no sale ningún aviso/)).toBeInTheDocument();
  });
});
