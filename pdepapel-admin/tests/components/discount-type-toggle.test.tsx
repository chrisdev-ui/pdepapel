// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscountTypeToggle } from "@/components/ui/discount-type-toggle";

describe("DiscountTypeToggle", () => {
  afterEach(cleanup);

  it("keeps one tab stop and moves the selection with the arrow keys", () => {
    const onChange = vi.fn();
    render(<DiscountTypeToggle value="PERCENTAGE" onChange={onChange} />);
    const pct = screen.getByRole("radio", { name: "Porcentaje" });
    const fixed = screen.getByRole("radio", { name: "Monto fijo" });
    expect(pct).toHaveAttribute("aria-checked", "true");
    expect(pct).toHaveAttribute("tabindex", "0");
    expect(fixed).toHaveAttribute("tabindex", "-1");
    pct.focus();
    fireEvent.keyDown(pct, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("FIXED");
    expect(document.activeElement).toBe(fixed);
    fireEvent.keyDown(fixed, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("PERCENTAGE");
    fireEvent.keyDown(fixed, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("FIXED");
    fireEvent.keyDown(fixed, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("PERCENTAGE");
  });

  it("starts empty when no value is given and makes the first option the tab stop", () => {
    const onChange = vi.fn();
    render(<DiscountTypeToggle value={undefined} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Porcentaje" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Monto fijo" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Porcentaje" })).toHaveAttribute("tabindex", "0");
    fireEvent.click(screen.getByRole("radio", { name: "Monto fijo" }));
    expect(onChange).toHaveBeenCalledWith("FIXED");
  });

  it("ignores clicks and keys while disabled", () => {
    const onChange = vi.fn();
    render(<DiscountTypeToggle value="FIXED" onChange={onChange} disabled />);
    const fixed = screen.getByRole("radio", { name: "Monto fijo" });
    expect(fixed).toBeDisabled();
    fireEvent.click(fixed);
    expect(onChange).not.toHaveBeenCalled();
  });
});
