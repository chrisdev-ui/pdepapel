/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AutocompleteLocation } from "@/components/ui/autocomplete-location";
import type { LocationOption } from "@/types";

/**
 * Regresión del 26 oct: el campo vaciaba lo escrito cada vez que llegaban
 * resultados (la tienda buscaba «B», «u», «c»… letra por letra) y al salir
 * sin tocar una opción. Una persona que escribe su ciudad no puede perderla.
 */

const option = (daneCode: string, city: string, department: string): LocationOption =>
  ({ value: daneCode, label: `${city} - ${department}`, daneCode, city, department }) as LocationOption;

const BOGOTA = option("11001000", "BOGOTÁ D.C.", "BOGOTÁ D.C.");
const PUERTO_BOGOTA = option("25572000", "PUERTO BOGOTA", "CUNDINAMARCA");
const MOSQUERA_C = option("25473000", "MOSQUERA", "CUNDINAMARCA");
const MOSQUERA_N = option("52473000", "MOSQUERA", "NARIÑO");

beforeAll(() => {
  // cmdk mide y desplaza la lista; jsdom no lo implementa.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= vi.fn();
});

afterEach(cleanup);

function Harness({
  options,
  onChange = vi.fn(),
  initialValue = "",
}: {
  options: LocationOption[];
  onChange?: (value: string, location?: LocationOption) => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <AutocompleteLocation
      // Igual que antes del arreglo: un arreglo nuevo en cada render.
      options={[...options]}
      value={value}
      onChange={(next, location) => {
        setValue(next);
        onChange(next, location);
      }}
      emptyAction={<a href="https://wa.me/573000000000">¿No aparece? Escríbenos por WhatsApp</a>}
    />
  );
}

const input = () => screen.getByRole("combobox");

function typeLetters(text: string, rerender: (ui: JSX.Element) => void, options: LocationOption[]) {
  let typed = "";
  for (const letter of text) {
    typed += letter;
    fireEvent.change(input(), { target: { value: typed } });
    // Llegan resultados (otro arreglo) después de cada letra.
    act(() => rerender(<Harness options={options} />));
  }
}

describe("AutocompleteLocation", () => {
  it("lo escrito se queda aunque lleguen resultados nuevos en cada letra", () => {
    const { rerender } = render(<Harness options={[]} />);
    fireEvent.focus(input());
    typeLetters("Bucaramanga", rerender, [BOGOTA, PUERTO_BOGOTA]);
    expect(input()).toHaveValue("Bucaramanga");
  });

  it("al salir sin elegir conserva el texto y explica qué falta", () => {
    render(<Harness options={[MOSQUERA_C, MOSQUERA_N]} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "Mosquera" } });
    fireEvent.blur(input());
    expect(input()).toHaveValue("Mosquera");
    expect(screen.getByRole("status")).toHaveTextContent("Toca tu ciudad en la lista para elegirla.");
    expect(input()).toHaveAttribute("aria-describedby", expect.stringContaining(screen.getByRole("status").id));
  });

  it("si lo escrito es exactamente una ciudad, se elige sola al salir", () => {
    const onChange = vi.fn();
    render(<Harness options={[BOGOTA, PUERTO_BOGOTA]} onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "Bogotá" } });
    fireEvent.blur(input());
    expect(onChange).toHaveBeenLastCalledWith("11001000", BOGOTA);
    expect(input()).toHaveValue("BOGOTÁ D.C. - BOGOTÁ D.C.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("también con Enter", () => {
    const onChange = vi.fn();
    render(<Harness options={[BOGOTA, PUERTO_BOGOTA]} onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "bogota dc" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("11001000", BOGOTA);
  });

  it("no adivina cuando hay dos ciudades con el mismo nombre", () => {
    const onChange = vi.fn();
    render(<Harness options={[MOSQUERA_C, MOSQUERA_N]} onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "Mosquera" } });
    fireEvent.blur(input());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cambiar el texto de una ciudad elegida la suelta sin borrar lo que se escribe", () => {
    const onChange = vi.fn();
    render(<Harness options={[BOGOTA, PUERTO_BOGOTA]} onChange={onChange} initialValue="11001000" />);
    expect(input()).toHaveValue("BOGOTÁ D.C. - BOGOTÁ D.C.");
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "Puerto" } });
    expect(onChange).toHaveBeenLastCalledWith("", undefined);
    expect(input()).toHaveValue("Puerto");
  });

  it("tocar una opción la elige", () => {
    const onChange = vi.fn();
    render(<Harness options={[BOGOTA, PUERTO_BOGOTA]} onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "puerto" } });
    fireEvent.click(screen.getByRole("option", { name: /PUERTO BOGOTA/ }));
    expect(onChange).toHaveBeenLastCalledWith("25572000", PUERTO_BOGOTA);
  });

  it("sin resultados ofrece escribir por WhatsApp", () => {
    render(<Harness options={[]} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "Pueblo que no existe" } });
    expect(screen.getByText("No se encontraron ciudades.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "¿No aparece? Escríbenos por WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/573000000000",
    );
  });
});
