// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Combobox } from "@/components/ui/combobox";

const options = [
  { value: "s1", label: "Distribuidora Kawaii SAS", keywords: ["kawaii"] },
  { value: "s2", label: "Papeles del Valle" },
  { value: "s3", label: "Importadora Sanrio", description: "Bogotá" },
];

afterEach(cleanup);

describe("Combobox", () => {
  it("searches the options and reports the chosen value", () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={options}
        value={null}
        onChange={onChange}
        placeholder="Proveedor"
        aria-label="Proveedor"
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Proveedor" }));
    fireEvent.change(screen.getByPlaceholderText("Buscar…"), {
      target: { value: "sanrio" },
    });

    expect(screen.getByText("Importadora Sanrio")).toBeInTheDocument();
    expect(screen.queryByText("Papeles del Valle")).toBeNull();

    fireEvent.click(screen.getByText("Importadora Sanrio"));
    expect(onChange).toHaveBeenCalledWith("s3");
  });

  it("offers to create a record from the search when nothing matches", () => {
    const onCreate = vi.fn();
    render(
      <Combobox
        options={options}
        value="s2"
        onChange={vi.fn()}
        onCreate={onCreate}
        aria-label="Proveedor"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Proveedor" })).toHaveTextContent(
      "Papeles del Valle",
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Proveedor" }));
    fireEvent.change(screen.getByPlaceholderText("Buscar…"), {
      target: { value: "Nuevo proveedor" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Crear “Nuevo proveedor”/ }));
    expect(onCreate).toHaveBeenCalledWith("Nuevo proveedor");
  });

  it("renders an option icon in the list and in the trigger", () => {
    const swatch = (
      <span data-testid="swatch" style={{ backgroundColor: "#FEA4C3" }} />
    );
    render(
      <Combobox
        options={[{ value: "c1", label: "Rosa pastel", icon: swatch }]}
        value="c1"
        onChange={vi.fn()}
        aria-label="Color"
      />,
    );

    expect(screen.getByTestId("swatch")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Color" }));
    expect(screen.getAllByTestId("swatch")).toHaveLength(2);
  });
});
