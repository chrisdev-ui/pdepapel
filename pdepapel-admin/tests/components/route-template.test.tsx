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

  it("with reduced motion it renders the same element and lands in 0 s (no hydration mismatch)", () => {
    motionProps.reduce = true;
    render(<Template>Productos</Template>);
    expect(screen.getByText("Productos")).toBeTruthy();
    // Swapping to a plain <div> left the server's opacity 0 in place: the screen stayed invisible.
    expect(screen.getByTestId("motion")).toBeTruthy();
    expect(motionProps.last?.transition).toEqual({ duration: 0 });
    expect(motionProps.last?.animate).toMatchObject({ opacity: 1 });
  });
});
