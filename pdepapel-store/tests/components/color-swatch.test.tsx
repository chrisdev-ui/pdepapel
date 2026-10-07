/* @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ColorSwatch, swatchPaintStyle } from "@/components/ui/color-swatch";
import { getSwatchPaint } from "@/lib/color-swatch";

afterEach(cleanup);

const paintOf = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-swatch-paint]")!;

describe("ColorSwatch", () => {
  it("regression #3: Multicolor and Blanco (both #FFFFFF) render different swatches", () => {
    const blanco = render(<ColorSwatch color={{ value: "#ffffff", swatchType: "SOLID" }} />).container;
    const multicolor = render(<ColorSwatch color={{ value: "#ffffff", swatchType: "MULTICOLOR" }} />).container;
    expect(blanco.querySelector("[data-swatch-type]")).toHaveAttribute("data-swatch-type", "SOLID");
    expect(multicolor.querySelector("[data-swatch-type]")).toHaveAttribute("data-swatch-type", "MULTICOLOR");
    expect(swatchPaintStyle(getSwatchPaint("MULTICOLOR", "#ffffff"))).not.toEqual(swatchPaintStyle(getSwatchPaint("SOLID", "#ffffff")));
  });

  it("is decorative: hidden from assistive tech, the wrapping link names it", () => {
    const { container } = render(<ColorSwatch color={{ value: "#8E44AD" }} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("paints the hex first so an old browser keeps the tone", () => {
    const { container } = render(<ColorSwatch color={{ value: "#ea3b68", swatchType: "NEON" }} />);
    expect(paintOf(container).style.backgroundColor).toBe("rgb(234, 59, 104)");
    // El halo del neón va en la sombra, junto al borde interior.
    expect(swatchPaintStyle(getSwatchPaint("NEON", "#ea3b68")).boxShadow).toBe(
      "inset 0 0 0 1px rgba(15, 23, 42, 0.14), 0 0 8px 2px rgba(234, 59, 104, 0.7)",
    );
  });

  it("marks the selected swatch with the navy border and ring", () => {
    const { container } = render(<ColorSwatch color={{ value: "#000000" }} selected />);
    expect(container.firstElementChild).toHaveClass("border-blue-yankees", "ring-1");
    expect(container.firstElementChild).toHaveAttribute("data-selected", "true");
  });

  it("dims a sold-out swatch and crosses it with an outlined navy diagonal", () => {
    const { container } = render(<ColorSwatch color={{ value: "#FB3B15" }} soldOut />);
    expect(paintOf(container)).toHaveClass("opacity-[0.45]");
    const slash = container.querySelector("[data-swatch-slash] > span");
    expect(slash).toHaveClass("bg-blue-yankees", "shadow-[0_0_0_1.5px_#ffffff]");
  });

  it("shows «?» for an invalid hex", () => {
    const { container } = render(<ColorSwatch color={{ value: "" }} />);
    expect(paintOf(container)).toHaveTextContent("?");
    expect(container.firstElementChild).toHaveAttribute("data-swatch-unknown", "true");
  });

  it("renders the small filter and dot sizes as a single painted circle", () => {
    const small = render(<ColorSwatch color={{ value: "#ffffff", swatchType: "TRANSPARENT" }} size="sm" />).container.firstElementChild as HTMLElement;
    expect(small).toHaveClass("h-3.5", "w-3.5");
    expect(small.dataset.swatchType).toBe("TRANSPARENT");
    const dot = render(<ColorSwatch color={{ value: "#ffffff" }} size="dot" />).container.firstElementChild as HTMLElement;
    expect(dot).toHaveClass("h-5", "w-5");
    // Blanco: borde interior reforzado para que no desaparezca sobre el fondo.
    expect(swatchPaintStyle(getSwatchPaint("SOLID", "#ffffff"), "dot").boxShadow).toBe("inset 0 0 0 1.5px rgba(15, 23, 42, 0.38)");
  });
});
