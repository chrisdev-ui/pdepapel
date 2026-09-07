// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AnnouncementBar } from "@/components/announcement-bar";

describe("AnnouncementBar", () => {
  afterEach(cleanup);

  it("shows shipping coverage, the free-shipping threshold, and the country", () => {
    render(<AnnouncementBar freeShippingThreshold={120000} />);

    expect(screen.getAllByText("Envíos a toda Colombia")).toHaveLength(2);
    expect(screen.getByText("Envío gratis desde $ 120.000")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Colombia" })).toBeInTheDocument();
    expect(screen.getByText("Colombia")).toBeInTheDocument();
    expect(document.querySelector(".announcement-slide")).not.toBeNull();
  });

  it("stays static with a single message when free shipping is off", () => {
    render(<AnnouncementBar freeShippingThreshold={null} />);

    expect(screen.getAllByText("Envíos a toda Colombia")).toHaveLength(1);
    expect(screen.queryByText(/Envío gratis/)).not.toBeInTheDocument();
    expect(document.querySelector(".announcement-slide")).toBeNull();
  });
});
