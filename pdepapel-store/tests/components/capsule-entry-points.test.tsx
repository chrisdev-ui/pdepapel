// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...(props as Record<string, string>)} />
  ),
}));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn() }));

import { CapsuleConditions } from "@/components/capsules/capsule-conditions";
import { CapsuleEditionBanner } from "@/components/capsules/capsule-edition-banner";
import { CategoryDrawer } from "@/components/category-drawer";

const edition = { number: 1, name: "Escritorio", theme: "escritorio", segment: "1-escritorio", coverImage: "https://res.cloudinary.com/demo/image/upload/c.jpg", fromPack: { packSize: 5, total: 64500 } };

describe("entradas a las cápsulas", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(cleanup);

  it("el cajón muestra «Cápsulas» solo con una edición a la venta", () => {
    const { unmount } = render(<CategoryDrawer types={[]} featuredSubcategories={[]} logoSrc="/logo.webp" />);
    fireEvent.click(screen.getByRole("button", { name: /menú|categorías/i }));
    expect(screen.queryByRole("link", { name: "Cápsulas" })).toBeNull();
    unmount();
    render(<CategoryDrawer types={[]} featuredSubcategories={[]} logoSrc="/logo.webp" hasCapsules />);
    fireEvent.click(screen.getByRole("button", { name: /menú|categorías/i }));
    expect(screen.getByRole("link", { name: "Cápsulas" }).getAttribute("href")).toBe("/capsulas");
  });

  it("el banner del inicio no existe sin edición y, con ella, lleva a /capsulas sin cupos ni valor del contenido", () => {
    const { container } = render(<CapsuleEditionBanner edition={null} />);
    expect(container.innerHTML).toBe("");
    render(<CapsuleEditionBanner edition={edition} />);
    expect(screen.getByRole("heading", { name: "Escritorio" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver la edición" }).getAttribute("href")).toBe("/capsulas");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Pack de 5 por");
    for (const word of ["cupo", "vale", "suerte", "valor"]) expect(text.toLowerCase()).not.toContain(word);
    // La foto es decorativa: el nombre de la edición ya está en el título.
    expect(screen.getByRole("presentation", { hidden: true }).getAttribute("alt")).toBe("");
  });

  it("las condiciones dicen cómo funciona, el retracto y el video, con sus políticas", () => {
    render(<CapsuleConditions opensAt="08:00" />);
    const text = document.body.textContent ?? "";
    for (const phrase of ["1 cápsula = 1 papel con el nombre de 1 producto", "desde 5 cápsulas", "equivalentes", "Lo que puede salir", "regalo es fijo", "a las 08:00", "Ley 1480 de 2011, art. 47", "primer nombre"]) {
      expect(text).toContain(phrase);
    }
    expect(text.toLowerCase()).not.toContain("suerte");
    expect(text).not.toMatch(/\$\s?\d/);
    expect(screen.getByRole("link", { name: "política de cambios y devoluciones" }).getAttribute("href")).toBe("/politicas/devoluciones");
    expect(screen.getByRole("link", { name: "términos y condiciones" }).getAttribute("href")).toBe("/politicas/terminos");
    expect(screen.getByRole("link", { name: "política de tratamiento de datos" }).getAttribute("href")).toBe("/politicas/privacidad#videos-de-capsulas");
  });
});
