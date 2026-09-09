/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Reviews } from "@/components/reviews/reviews";

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="review-form" />,
}));

afterEach(cleanup);

const review = (id: string, rating: number, createdAt: string) => ({
  id,
  userId: `u-${id}`,
  name: `Clienta ${id}`,
  rating,
  comment: `Comentario ${id}`,
  createdAt,
});

describe("Reviews", () => {
  it("renders the summary, the distribution and the newest reviews first without waiting for the client", () => {
    const reviews = [review("1", 5, "2026-08-01T12:00:00Z"), review("2", 4, "2026-09-01T12:00:00Z"), review("3", 2, "2026-07-01T12:00:00Z")];
    render(<Reviews productId="p1" reviews={reviews} />);

    expect(screen.getByRole("heading", { name: "Reseñas", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("3,7")).toBeInTheDocument();
    expect(screen.getByText("3 reseñas · 67 % la recomienda")).toBeInTheDocument();
    const items = screen.getAllByRole("article");
    expect(items[0]).toHaveTextContent("Comentario 2");
    expect(items[0]).toHaveTextContent("1 de septiembre de 2026");
    expect(screen.getByTestId("review-form")).toBeInTheDocument();
  });

  it("invites the first review when there are none", () => {
    render(<Reviews productId="p1" reviews={[]} />);
    expect(screen.getByText(/Todavía no hay reseñas/)).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("paginates long lists four at a time", () => {
    const reviews = Array.from({ length: 6 }, (_, index) => review(String(index), 5, `2026-0${index + 1}-01T12:00:00Z`));
    render(<Reviews productId="p1" reviews={reviews} />);
    expect(screen.getAllByRole("article")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Ver más reseñas" }));
    expect(screen.getAllByRole("article")).toHaveLength(6);
  });
});
