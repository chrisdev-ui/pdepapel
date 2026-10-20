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

  it("links the four networks in order, in a new tab, with Spanish labels", () => {
    render(<Footer />);
    const expected = [
      ["Instagram de P de Papel", "https://instagram.com/papeleria.pdepapel"],
      ["TikTok de P de Papel", "https://tiktok.com/@papeleria.pdepapel"],
      ["Facebook de P de Papel", "https://www.facebook.com/papeleriapdepapel/"],
      ["YouTube de P de Papel", "https://www.youtube.com/@papeleriapdepapel"],
    ];
    const links = screen.getAllByRole("link", { name: / de P de Papel$/ });
    expect(links.map((link) => [link.getAttribute("aria-label"), link.getAttribute("href")])).toEqual(expected);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link.querySelector("svg")).not.toBeNull();
    }
  });
});
