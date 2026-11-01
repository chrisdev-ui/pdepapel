// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const tracked = vi.hoisted(() => ({ calls: [] as [string, Record<string, unknown>][] }));

vi.mock("@/components/ui/cloudinary-image", () => ({ CloudinaryImage: (props: React.ComponentProps<"img">) => <img {...props} /> }));
vi.mock("@/lib/customer-analytics", () => ({
  trackGoogleEvent: (name: string, params: Record<string, unknown>) => tracked.calls.push([name, params]),
}));

import { CampaignBanner, presaleOfferLine } from "@/components/home/campaign-banner";
import type { HomeContent } from "@/types";

afterEach(() => {
  cleanup();
  tracked.calls.length = 0;
});

const presale = {
  productId: "kiut",
  slug: "calendario-de-adviento-kiut-love-letters",
  name: "Calendario de adviento Kiut Love Letters",
  price: 160_000,
  paymentMode: "DEPOSIT" as const,
  depositPerUnit: 30_000,
  minInstallment: 10_000,
  imageUrl: "https://res.cloudinary.com/demo/image/upload/kiut.png",
};

const campaign: HomeContent = {
  id: "campaign-kiut",
  placement: "CAMPAIGN",
  campaignType: "PRESALE",
  eyebrow: "Preventa · llega en diciembre",
  title: "Calendario de Adviento Kiut",
  subtitle: null,
  primaryLabel: "Separar el mío",
  primaryUrl: "/producto/calendario-de-adviento-kiut-love-letters",
  secondaryLabel: null,
  secondaryUrl: null,
  imageUrl: presale.imageUrl,
  mobileImageUrl: null,
  imageAlt: presale.name,
  promotionId: "kiut-adviento-2026",
  presale,
  startsAt: "2026-11-01T05:00:00.000Z",
  endsAt: null,
  products: [],
};

describe("banner de preventa en la portada", () => {
  it("muestra los números del panel, sin calcular nada, y lleva a la ficha", () => {
    render(<CampaignBanner campaign={campaign} />);
    expect(screen.getByRole("heading", { name: "Calendario de Adviento Kiut" })).toBeInTheDocument();
    expect(screen.getByText("Preventa · llega en diciembre")).toBeInTheDocument();
    const line = screen.getByText((_, node) => node?.tagName === "P" && node.textContent === "Sepáralo con $ 30.000 y abona desde $ 10.000");
    // Cada monto en un solo renglón: «$» y la cifra no se separan en el teléfono.
    expect(Array.from(line.querySelectorAll("span.whitespace-nowrap")).map((span) => span.textContent)).toEqual(["$ 30.000", "$ 10.000"]);
    expect(screen.getByRole("link", { name: "Separar el mío" })).toHaveAttribute("href", "/producto/calendario-de-adviento-kiut-love-letters");
    expect(screen.getByRole("img", { name: presale.name })).toBeInTheDocument();
    expect(screen.queryByText(/limitad/i)).toBeNull();
  });

  it("tocar el botón manda select_promotion con el promotion_id de la campaña", () => {
    render(<CampaignBanner campaign={campaign} />);
    fireEvent.click(screen.getByRole("link", { name: "Separar el mío" }));
    expect(tracked.calls).toContainEqual([
      "select_promotion",
      expect.objectContaining({
        promotion_id: "kiut-adviento-2026",
        creative_slot: "home_campaign",
        items: [{ item_id: "kiut", item_name: presale.name, price: 160_000 }],
      }),
    ]);
  });

  it("la línea del anticipo solo existe con anticipo, y sin saldo no promete abonos", () => {
    expect(presaleOfferLine({ ...presale, paymentMode: "FULL", minInstallment: null })).toBeNull();
    expect(presaleOfferLine({ ...presale, minInstallment: null })).toBe("Sepáralo con $ 30.000");
    expect(presaleOfferLine(null)).toBeNull();
  });

  it("con foto para el teléfono, se pinta aparte y la grande queda oculta en el teléfono", () => {
    render(<CampaignBanner campaign={{ ...campaign, mobileImageUrl: "https://res.cloudinary.com/demo/image/upload/kiut-movil.png" }} />);
    const images = screen.getAllByRole("img", { name: presale.name });
    expect(images).toHaveLength(2);
    expect(images[0].className).toContain("sm:hidden");
    expect(images[1].className).toContain("hidden sm:block");
  });
});
