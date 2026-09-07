// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/privacy-preferences-button", () => ({
  PrivacyPreferencesButton: () => <button type="button">Preferencias de privacidad</button>,
}));

import { Footer } from "@/components/footer";

afterEach(cleanup);

describe("Footer", () => {
  it("links to the full catalog so every page offers a way into the shop", () => {
    render(<Footer />);

    expect(
      screen.getByRole("link", { name: /Ver todos los productos/ }),
    ).toHaveAttribute("href", "/tienda");
    expect(screen.getByRole("link", { name: /Ir al inicio/ })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
