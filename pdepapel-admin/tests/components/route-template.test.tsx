// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const motionProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown>, reduce: false }));

vi.mock("framer-motion", () => ({
  useReducedMotion: () => motionProps.reduce,
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => {
      motionProps.last = props;
      return <div data-testid="motion">{children}</div>;
    },
  },
}));

import Template from "@/app/(dashboard)/[storeId]/(routes)/template";

afterEach(() => {
  cleanup();
  motionProps.last = null;
  motionProps.reduce = false;
});

describe("admin route template", () => {
  it("fades each screen in quickly (0.15 s, not 0.75 s)", () => {
    render(<Template>Pedidos</Template>);
    expect(screen.getByText("Pedidos")).toBeTruthy();
    expect(motionProps.last?.transition).toMatchObject({ duration: 0.15 });
  });

  it("does not animate when the user prefers reduced motion", () => {
    motionProps.reduce = true;
    render(<Template>Productos</Template>);
    expect(screen.getByText("Productos")).toBeTruthy();
    expect(screen.queryByTestId("motion")).toBeNull();
    expect(motionProps.last).toBeNull();
  });
});
