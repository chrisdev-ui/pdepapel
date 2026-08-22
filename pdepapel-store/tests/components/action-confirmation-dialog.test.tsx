// @vitest-environment jsdom

import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("ActionConfirmationDialog", () => {
  it("keeps confirmation actions accessible and within the mobile viewport", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ActionConfirmationDialog
        isOpen
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title="¿Eliminar dirección guardada?"
        description="No afectará los pedidos que ya realizaste."
        confirmLabel="Eliminar dirección"
        destructive
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass(
      "w-[calc(100%-2rem)]",
      "max-h-[calc(100dvh-2rem)]",
      "min-w-0",
      "overflow-y-auto",
    );

    await user.click(
      screen.getByRole("button", { name: "Eliminar dirección" }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
