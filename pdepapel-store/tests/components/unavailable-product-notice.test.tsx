/* @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

import { UnavailableProductNotice } from "@/components/unavailable-product-notice";

describe("UnavailableProductNotice", () => {
  afterEach(() => {
    cleanup();
    mocks.toast.mockClear();
    window.history.replaceState(null, "", "/");
  });

  it("tells the shopper the product is gone and removes the fragment", () => {
    window.history.replaceState(null, "", "/categoria/termos#producto-no-disponible");
    render(<UnavailableProductNotice />);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("ya no está disponible") }));
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/categoria/termos");
  });

  it("stays silent on a normal visit", () => {
    window.history.replaceState(null, "", "/categoria/termos");
    render(<UnavailableProductNotice />);
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
