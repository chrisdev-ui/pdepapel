// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Loader } from "@/components/loader";

describe("Loader", () => {
  afterEach(() => cleanup());

  it("announces itself and reserves vertical space", () => {
    render(<Loader label="Cargando tus órdenes" />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Cargando tus órdenes");
    expect(status).toHaveAttribute("aria-busy", "true");
    // Regression: the loader used to collapse to the spinner height and
    // position its label absolutely, so it overlapped the footer.
    expect(status.className).toMatch(/min-h-\[50vh\]/);
    expect(status.querySelector("[class*='absolute'] p")).toBeNull();
  });

  it("floats in the centre of the screen with no background", () => {
    render(<Loader />);

    const status = screen.getByRole("status");
    const floating = status.firstElementChild as HTMLElement;
    expect(floating.className).toMatch(/\bfixed\b/);
    expect(floating.className).toMatch(/\binset-0\b/);
    expect(floating.className).toMatch(/\bjustify-center\b/);
    expect(floating.className).toMatch(/\bpointer-events-none\b/);
    for (const node of [status, ...Array.from(status.querySelectorAll<HTMLElement>("*"))]) {
      expect(String(node.getAttribute("class") ?? "")).not.toMatch(/\bbg-(?!transparent)|backdrop-/);
    }
  });

  it("falls back to a generic label", () => {
    render(<Loader />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });
});
