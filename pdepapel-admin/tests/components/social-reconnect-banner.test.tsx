// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { SocialReconnectBanner } from "@/app/(dashboard)/[storeId]/(routes)/components/social-reconnect-banner";

describe("aviso de reconexión en Inicio", () => {
  afterEach(() => cleanup());

  it("nombra las redes y lleva a Métricas de redes", () => {
    render(<SocialReconnectBanner storeId="store-1" platforms={["INSTAGRAM", "TIKTOK"]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Hay que reconectar Instagram y TikTok");
    expect(screen.getByRole("link", { name: "Ir a Métricas de redes" })).toHaveAttribute("href", "/store-1/redes");
  });

  it("sin redes por reconectar no pinta nada", () => {
    const { container } = render(<SocialReconnectBanner storeId="store-1" platforms={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
