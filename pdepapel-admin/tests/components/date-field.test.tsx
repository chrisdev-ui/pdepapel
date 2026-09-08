// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateField } from "@/components/ui/date-field";

afterEach(cleanup);

describe("DateField", () => {
  it("opens the calendar from the whole field, not only the icon", () => {
    render(<DateField id="fecha" aria-label="Fecha" />);

    const trigger = screen.getByRole("button", { name: "Fecha" });
    expect(trigger).toHaveTextContent("Elige una fecha");
    fireEvent.click(trigger);

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoy" })).toBeInTheDocument();
  });

  it("reports ISO dates and mirrors them into the hidden input for native forms", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateField name="startsAt" aria-label="Inicio" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Inicio" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));

    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(onChange).toHaveBeenCalledWith(iso);
    expect(
      container.querySelector('input[type="hidden"][name="startsAt"]'),
    ).toHaveValue(iso);
  });

  it("shows the controlled value in Spanish and clears it when allowed", () => {
    const onChange = vi.fn();
    render(
      <DateField
        aria-label="Fecha"
        value="2026-09-07"
        onChange={onChange}
        clearable
      />,
    );

    expect(screen.getByRole("button", { name: "Fecha" })).toHaveTextContent(
      "7 de septiembre de 2026",
    );
    fireEvent.click(screen.getByRole("button", { name: "Quitar fecha" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
