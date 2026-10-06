// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/tienda", trackGoogleEvent: vi.fn(), callback: null as null | ((list: { getEntries: () => unknown[] }) => void) }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/customer-analytics", () => ({ trackGoogleEvent: mocks.trackGoogleEvent }));

import { WebVitalsReporter, WEB_VITALS_CLS_EVENT } from "@/components/web-vitals-reporter";

class FakeObserver {
  static supportedEntryTypes = ["layout-shift"];
  constructor(callback: (list: { getEntries: () => unknown[] }) => void) {
    mocks.callback = callback;
  }
  observe() {}
  disconnect() {}
}

const emit = (...entries: Array<{ startTime: number; value: number; node?: Element }>) =>
  act(() => {
    mocks.callback?.({
      getEntries: () =>
        entries.map((entry) => ({
          ...entry,
          hadRecentInput: false,
          sources: entry.node ? [{ node: entry.node, previousRect: { width: 10, height: 10 }, currentRect: { width: 10, height: 10 } }] : [],
        })),
    });
  });
const hide = () =>
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

beforeEach(() => {
  vi.stubGlobal("PerformanceObserver", FakeObserver);
  mocks.pathname = "/tienda";
  mocks.trackGoogleEvent.mockReset();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WebVitalsReporter", () => {
  it("sends the page's CLS, the path and the element that moved most when the page is hidden", () => {
    document.body.innerHTML = "";
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    document.body.appendChild(footer);
    render(<WebVitalsReporter sampleRate={1} />);
    emit({ startTime: 100, value: 0.03 }, { startTime: 400, value: 0.027, node: footer });
    hide();
    hide(); // una sola vez por vista

    expect(mocks.trackGoogleEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackGoogleEvent).toHaveBeenCalledWith(WEB_VITALS_CLS_EVENT, {
      cls_value: 0.057,
      cls_largest_value: 0.03,
      cls_largest_target: "(ninguno)",
      cls_page: "/tienda",
    });
  });

  it("sends nothing for a view outside the 10 % sample", () => {
    render(<WebVitalsReporter sampleRate={0} />);
    emit({ startTime: 100, value: 0.2 });
    hide();
    expect(mocks.trackGoogleEvent).not.toHaveBeenCalled();
  });

  it("reports the previous view on a client-side navigation and starts a new one", () => {
    const { rerender } = render(<WebVitalsReporter sampleRate={1} />);
    emit({ startTime: 100, value: 0.1 });
    mocks.pathname = "/carrito";
    rerender(<WebVitalsReporter sampleRate={1} />);
    expect(mocks.trackGoogleEvent).toHaveBeenLastCalledWith(WEB_VITALS_CLS_EVENT, expect.objectContaining({ cls_value: 0.1, cls_page: "/tienda" }));

    hide();
    expect(mocks.trackGoogleEvent).toHaveBeenLastCalledWith(WEB_VITALS_CLS_EVENT, expect.objectContaining({ cls_value: 0, cls_page: "/carrito" }));
  });

  it("does nothing where the browser has no layout-shift entries", () => {
    vi.stubGlobal("PerformanceObserver", class { static supportedEntryTypes = ["paint"]; observe() {} disconnect() {} });
    render(<WebVitalsReporter sampleRate={1} />);
    hide();
    expect(mocks.trackGoogleEvent).not.toHaveBeenCalled();
  });
});
