/* @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GroupBadge } from "@/components/ui/group-badge";
import { OfferBadge } from "@/components/ui/offer-badge";

describe("Product card badges", () => {
  it("keeps the group badge inside the card boundary", () => {
    const { container } = render(<GroupBadge optionsCount={4} />);

    expect(container.firstElementChild).toHaveClass(
      "pointer-events-none",
      "right-2",
    );
    expect(container.firstElementChild).not.toHaveClass("-right-3");
  });

  it("keeps the offer badge inside the card boundary", () => {
    const { container } = render(<OfferBadge text="En oferta" />);

    expect(container.firstElementChild).toHaveClass(
      "pointer-events-none",
      "right-2",
    );
    expect(container.firstElementChild).not.toHaveClass("-right-2");
  });
});
