/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseMediaQuery, mockUsePageVisibility } = vi.hoisted(() => ({
  mockUseMediaQuery: vi.fn(),
  mockUsePageVisibility: vi.fn(),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: mockUseMediaQuery,
}));

vi.mock("@/hooks/use-page-visibility", () => ({
  usePageVisibility: mockUsePageVisibility,
}));

vi.mock("@namnguyenthanhwork/react-snowfall-effect", () => ({
  Snowfall: ({
    snowflakeCount,
    fps,
    followMouse,
    zIndex,
  }: {
    snowflakeCount: number;
    fps: number;
    followMouse: boolean;
    zIndex: number;
  }) => (
    <output
      data-follow-mouse={String(followMouse)}
      data-fps={fps}
      data-snowflake-count={snowflakeCount}
      data-testid="snowfall"
      data-z-index={zIndex}
    />
  ),
}));

import { Christmas } from "@/components/christmas";

describe("Christmas snowfall", () => {
  beforeEach(() => {
    mockUseMediaQuery.mockReturnValue(false);
    mockUsePageVisibility.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses a lighter, non-interactive desktop effect", () => {
    render(<Christmas />);

    const snowfall = screen.getByTestId("snowfall");
    expect(snowfall).toHaveAttribute("data-snowflake-count", "48");
    expect(snowfall).toHaveAttribute("data-fps", "36");
    expect(snowfall).toHaveAttribute("data-follow-mouse", "false");
    expect(snowfall).toHaveAttribute("data-z-index", "20");
  });

  it("uses a lighter mobile effect", () => {
    mockUseMediaQuery.mockImplementation((query: string) =>
      query.includes("max-width"),
    );

    render(<Christmas />);

    const snowfall = screen.getByTestId("snowfall");
    expect(snowfall).toHaveAttribute("data-snowflake-count", "18");
    expect(snowfall).toHaveAttribute("data-fps", "24");
  });

  it("does not animate when the visitor reduces motion or hides the page", () => {
    mockUseMediaQuery.mockImplementation((query: string) =>
      query.includes("prefers-reduced-motion"),
    );
    const { rerender } = render(<Christmas />);

    expect(screen.queryByTestId("snowfall")).not.toBeInTheDocument();

    mockUseMediaQuery.mockReturnValue(false);
    mockUsePageVisibility.mockReturnValue(false);
    rerender(<Christmas />);

    expect(screen.queryByTestId("snowfall")).not.toBeInTheDocument();
  });
});
