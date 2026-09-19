// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttributeNameHints } from "@/app/(dashboard)/[storeId]/(routes)/atributos/components/attribute-form-hints";

afterEach(cleanup);

const siblings = [
  { id: "k1", name: "Rosado", usage: 109 },
  { id: "k2", name: "Rosa pastel", usage: 92 },
  { id: "k3", name: "Azul", usage: 5 },
];
const hrefFor = (id: string) => `/store-1/colores/${id}`;

/** Pistas bajo el campo Nombre: cómo se guardará, si ya existe (bloqueo con enlace) y si se parece (unión opcional). */
describe("AttributeNameHints", () => {
  it("previews the normalised name and stops on an exact duplicate with a link to it", () => {
    render(<AttributeNameHints name="  rosa   pastel " siblings={siblings} entity="color" hrefFor={hrefFor} />);
    expect(screen.getByText("Rosa pastel")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Ya existe un color llamado «Rosa pastel» (92 productos)");
    expect(screen.getByRole("link", { name: "ábrelo" })).toHaveAttribute("href", "/store-1/colores/k2");
  });

  it("suggests the merge for a similar name, and ignores the row being edited", () => {
    const onMerge = vi.fn();
    render(<AttributeNameHints name="Rosa pastel" siblings={siblings} currentId="k2" entity="color" hrefFor={hrefFor} onMerge={onMerge} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rosado" })).toHaveAttribute("href", "/store-1/colores/k1");
    fireEvent.click(screen.getByRole("button", { name: /Unir con «Rosado»/ }));
    expect(onMerge).toHaveBeenCalledWith("k1");
  });

  it("stays silent for an empty or unrelated name", () => {
    const { container, rerender } = render(<AttributeNameHints name="   " siblings={siblings} entity="color" hrefFor={hrefFor} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AttributeNameHints name="Verde" siblings={siblings} entity="color" hrefFor={hrefFor} />);
    expect(screen.queryByTestId("name-hints")?.textContent ?? "").toBe("");
  });
});
