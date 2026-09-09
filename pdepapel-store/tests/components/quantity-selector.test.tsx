/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuantitySelector } from "@/components/ui/quantity-selector";

afterEach(cleanup);

describe("QuantitySelector", () => {
  it("exposes spinbutton semantics and follows the arrow keys", () => {
    const onValueChange = vi.fn();
    render(<QuantitySelector max={3} initialValue={1} onValueChange={onValueChange} label="Cantidad" />);

    const input = screen.getByRole("spinbutton", { name: "Cantidad" });
    expect(input).toHaveAttribute("aria-valuemin", "1");
    expect(input).toHaveAttribute("aria-valuemax", "3");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onValueChange).toHaveBeenLastCalledWith(2);
    expect(input).toHaveAttribute("aria-valuenow", "2");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onValueChange).toHaveBeenLastCalledWith(1);
  });

  it("follows the parent when the initial value changes", () => {
    const { rerender } = render(<QuantitySelector max={5} initialValue={3} onValueChange={() => {}} />);
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-valuenow", "3");
    rerender(<QuantitySelector max={5} initialValue={1} onValueChange={() => {}} />);
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-valuenow", "1");
  });
});
