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
    expect(status.className).toMatch(/\bjustify-center\b/);
    expect(status.querySelector("[class*='absolute'] p")).toBeNull();
  });

  it("falls back to a generic label", () => {
    render(<Loader />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });
});
