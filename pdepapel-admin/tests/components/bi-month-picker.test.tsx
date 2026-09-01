/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BiMonthPicker } from "@/components/bi/bi-month-picker";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("tab=cash"),
}));

describe("BiMonthPicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T15:00:00.000Z"));
    window.history.replaceState({}, "", "/store-id/negocio");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("navigates to the previous month while preserving other parameters", () => {
    render(<BiMonthPicker activeYear={2026} activeMonth={8} />);

    const previousButton = screen.getByRole("button", {
      name: "Mes anterior",
    });
    expect(previousButton).toHaveClass("h-11", "w-11");

    fireEvent.click(previousButton);

    expect(mocks.push).toHaveBeenCalledWith(
      "/store-id/negocio?tab=cash&month=8&year=2026",
    );
  });

  it("prevents navigation beyond the current Colombia month", () => {
    render(<BiMonthPicker activeYear={2026} activeMonth={8} />);

    expect(
      screen.getByRole("button", { name: "Mes siguiente" }),
    ).toBeDisabled();
  });
});
