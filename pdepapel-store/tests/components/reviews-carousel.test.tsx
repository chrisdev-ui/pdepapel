/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeReview } from "@/types";

const { getReviews } = vi.hoisted(() => ({ getReviews: vi.fn() }));

vi.mock("@/actions/get-reviews", () => ({ getReviews }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

import { ReviewsCarousel } from "@/components/home/reviews-carousel";

const review = (id: string, overrides: Partial<HomeReview["product"]> = {}): HomeReview => ({
  id,
  productId: `p-${id}`,
  name: "Ana",
  rating: 5,
  comment: `Reseña ${id}`,
  reply: null,
  repliedAt: null,
  createdAt: "2026-01-21T00:00:00.000Z",
  product: { id: `p-${id}`, name: `Producto ${id}`, slug: `producto-${id}`, isArchived: false, imageUrl: null, ...overrides },
});

describe("ReviewsCarousel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing with fewer than three reviews", async () => {
    getReviews.mockResolvedValue({ reviews: [review("1"), review("2")], summary: { average: 5, count: 2 } });
    const element = await ReviewsCarousel();
    expect(element).toBeNull();
  });

  it("shows archived-product reviews without the product link", async () => {
    getReviews.mockResolvedValue({
      reviews: [review("1"), review("2"), review("3", { isArchived: true })],
      summary: { average: 5, count: 3 },
    });
    render(await ReviewsCarousel());

    expect(screen.getByRole("heading", { name: "Lo que dicen quienes ya compraron" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Reseña 3")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Ver producto" });
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/producto/producto-1", "/producto/producto-2"]);
  });
});
