// @vitest-environment jsdom

import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

function ConfirmationHarness() {
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [result, setResult] = useState("pending");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const confirmed = await requestConfirmation({
            title: "¿Aplicar cambio?",
            description: "Este cambio se enviará al proveedor externo.",
            confirmLabel: "Aplicar cambio",
          });
          setResult(confirmed ? "confirmed" : "cancelled");
        }}
      >
        Abrir confirmación
      </button>
      <output>{result}</output>
      {confirmationDialog}
    </>
  );
}

describe("useActionConfirmation", () => {
  afterEach(cleanup);

  it("uses the responsive application dialog and resolves false on cancellation", async () => {
    const user = userEvent.setup();
    render(<ConfirmationHarness />);

    await user.click(
      screen.getByRole("button", { name: "Abrir confirmación" }),
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveClass(
      "w-[calc(100%-2rem)]",
      "max-h-[calc(100dvh-2rem)]",
      "min-w-0",
      "overflow-y-auto",
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("cancelled")).toBeInTheDocument();
  });

  it("resolves true only after the administrator confirms", async () => {
    const user = userEvent.setup();
    render(<ConfirmationHarness />);

    await user.click(
      screen.getByRole("button", { name: "Abrir confirmación" }),
    );
    await user.click(screen.getByRole("button", { name: "Aplicar cambio" }));

    expect(await screen.findByText("confirmed")).toBeInTheDocument();
  });
});
