/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StarRating } from "@/components/ui/star-rating";

describe("StarRating", () => {
  it("renders product-card ratings as a static accessible summary", () => {
    render(<StarRating currentRating={4} isDisabled />);

    expect(
      screen.getByRole("img", {
        name: "Calificación: 4 de 5 estrellas",
      }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("keeps rating selection interactive outside product cards", async () => {
    const onRatingChange = vi.fn();
    const user = userEvent.setup();

    render(<StarRating currentRating={2} onRatingChange={onRatingChange} />);

    const ratings = screen.getAllByRole("button");
    expect(ratings).toHaveLength(5);

    await user.click(ratings[3]);

    expect(onRatingChange).toHaveBeenCalledWith(4);
  });
});
