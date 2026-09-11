// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";

import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

function Harness({ enabled = true, onLeave }: { enabled?: boolean; onLeave: (allowed: boolean) => void }) {
  const form = useForm<{ name: string }>({ defaultValues: { name: "" } });
  const { confirmLeave, confirmationDialog, isDirty } = useUnsavedChangesGuard(form, { enabled });
  return (
    <div>
      {confirmationDialog}
      <input aria-label="Nombre" {...form.register("name")} />
      <span data-testid="dirty">{String(isDirty)}</span>
      <button type="button" onClick={async () => onLeave(await confirmLeave())}>
        Volver
      </button>
    </div>
  );
}

afterEach(cleanup);

describe("useUnsavedChangesGuard", () => {
  it("lets a clean form leave without asking", async () => {
    const onLeave = vi.fn();
    render(<Harness onLeave={onLeave} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Volver" })));
    expect(onLeave).toHaveBeenCalledWith(true);
    expect(screen.queryByText("¿Salir sin guardar?")).toBeNull();
  });

  it("asks before leaving a dirty form and honours the answer", async () => {
    const onLeave = vi.fn();
    render(<Harness onLeave={onLeave} />);
    fireEvent.input(screen.getByLabelText("Nombre"), { target: { value: "Caja" } });
    expect(await screen.findByText("true", { selector: "[data-testid=dirty]" })).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Volver" })));
    expect(await screen.findByText("¿Salir sin guardar?")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Seguir editando" })));
    expect(onLeave).toHaveBeenCalledWith(false);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Volver" })));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Salir sin guardar" })));
    expect(onLeave).toHaveBeenLastCalledWith(true);
  });

  it("warns the browser on unload only while dirty and enabled", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { rerender } = render(<Harness onLeave={vi.fn()} />);
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);

    fireEvent.input(screen.getByLabelText("Nombre"), { target: { value: "Caja" } });
    await screen.findByText("true", { selector: "[data-testid=dirty]" });
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);

    rerender(<Harness enabled={false} onLeave={vi.fn()} />);
    expect(remove.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
    add.mockRestore();
    remove.mockRestore();
  });
});
