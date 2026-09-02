// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeferredNewsletterForm } from "@/components/deferred-newsletter-form";

vi.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: vi.fn(), inView: false }),
}));

describe("DeferredNewsletterForm", () => {
  it("reserves the responsive form height before loading its client bundle", () => {
    const { container: rendered } = render(<DeferredNewsletterForm />);

    const container = rendered.firstElementChild!;
    const placeholder = container.firstElementChild;

    expect(container).toHaveClass("min-h-[13rem]", "sm:min-h-[6.25rem]");
    expect(placeholder).toHaveClass(
      "min-h-[13rem]",
      "sm:min-h-[6.25rem]",
    );
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
  });
});
