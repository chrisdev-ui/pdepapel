/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReviewItem } from "@/components/reviews/review-item";

afterEach(cleanup);

const review = {
  id: "r1",
  userId: "u1",
  name: "Laura",
  rating: 5,
  comment: "Llegó rapidísimo y muy bien empacado.",
};

describe("ReviewItem", () => {
  it("shows the store reply under the customer comment when there is one", () => {
    render(
      <ReviewItem
        review={{ ...review, reply: "¡Gracias, Laura! Nos alegra mucho." }}
      />,
    );

    expect(screen.getByText("Respuesta de P de Papel")).toBeInTheDocument();
    expect(screen.getByText("¡Gracias, Laura! Nos alegra mucho.")).toBeInTheDocument();
  });

  it("renders no reply block for a review without a store reply", () => {
    render(<ReviewItem review={{ ...review, reply: null }} />);

    expect(screen.queryByTestId("review-reply")).toBeNull();
    expect(screen.getByText("Llegó rapidísimo y muy bien empacado.")).toBeInTheDocument();
  });
});
