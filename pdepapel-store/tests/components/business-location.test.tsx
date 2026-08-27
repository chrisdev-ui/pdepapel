/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Features from "@/components/features";
import { Footer } from "@/components/footer";

describe("business location messaging", () => {
  afterEach(cleanup);

  it("explains the Medellín origin and national delivery coverage", () => {
    render(
      <>
        <Features />
        <Footer />
      </>,
    );

    expect(screen.getAllByText("Envíos nacionales").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Desde Medellín enviamos a toda Colombia.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Operamos desde Medellín, Colombia"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tienda online con envíos a todo el país"),
    ).toBeInTheDocument();
  });
});
