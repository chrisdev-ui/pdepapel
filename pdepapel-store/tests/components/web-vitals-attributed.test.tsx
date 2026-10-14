// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Report = (metric: Record<string, unknown>) => void;

const mocks = vi.hoisted(() => ({
  pathname: "/producto/agenda-rosa",
  trackGoogleEvent: vi.fn(),
  onLCP: vi.fn(),
  onINP: vi.fn(),
  consent: true,
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/customer-analytics", () => ({ trackGoogleEvent: mocks.trackGoogleEvent }));
vi.mock("@/lib/web-vitals-attribution", () => ({ onLCP: mocks.onLCP, onINP: mocks.onINP }));
vi.mock("@/lib/analytics-consent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics-consent")>()),
  hasAnalyticsConsent: () => mocks.consent,
}));

import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { ANALYTICS_CONSENT_CHANGED_EVENT } from "@/lib/analytics-consent";
import { GA4_PARAM_VALUE_LIMIT, inpEventParams, lcpEventParams, WEB_VITALS_INP_EVENT, WEB_VITALS_LCP_EVENT } from "@/lib/web-vitals-events";

class FakeObserver {
  static supportedEntryTypes = ["layout-shift"];
  observe() {}
  disconnect() {}
}

const lcpMetric = (overrides: Record<string, unknown> = {}) => ({
  name: "LCP",
  value: 2843.6,
  rating: "needs-improvement",
  navigationType: "navigate",
  attribution: {
    url: "https://res.cloudinary.com/demo/image/upload/f_auto/v1/agenda.jpg?x=1",
    timeToFirstByte: 612.4,
    resourceLoadDelay: 88.6,
    resourceLoadDuration: 1700.2,
    elementRenderDelay: 442.4,
    lcpEntry: { element: { tagName: "IMG" } },
  },
  ...overrides,
});
const inpMetric = (overrides: Record<string, unknown> = {}) => ({
  name: "INP",
  value: 231.7,
  rating: "good",
  navigationType: "navigate",
  attribution: { interactionTarget: "button.add-to-cart", interactionType: "pointer" },
  ...overrides,
});

const registered = async () => {
  await vi.waitFor(() => expect(mocks.onLCP).toHaveBeenCalledTimes(1));
  return { lcp: mocks.onLCP.mock.calls[0][0] as Report, inp: mocks.onINP.mock.calls[0][0] as Report };
};

beforeEach(() => {
  vi.stubGlobal("PerformanceObserver", FakeObserver);
  mocks.trackGoogleEvent.mockReset();
  mocks.onLCP.mockReset();
  mocks.onINP.mockReset();
  mocks.consent = true;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WebVitalsReporter: LCP and INP with attribution", () => {
  it("every consented load sends LCP with its four subparts, element and host, and INP with target and type, even when CLS is not sampled", async () => {
    render(<WebVitalsReporter sampleRate={0} />);
    const { lcp, inp } = await registered();
    lcp(lcpMetric());
    inp(inpMetric());

    expect(mocks.trackGoogleEvent).toHaveBeenCalledWith(WEB_VITALS_LCP_EVENT, {
      lcp_value: 2844,
      lcp_ttfb: 612,
      lcp_load_delay: 89,
      lcp_load_duration: 1700,
      lcp_render_delay: 442,
      lcp_element: "img",
      lcp_url_host: "res.cloudinary.com",
      lcp_rating: "needs-improvement",
      lcp_page: "/producto/agenda-rosa",
    });
    expect(mocks.trackGoogleEvent).toHaveBeenCalledWith(WEB_VITALS_INP_EVENT, {
      inp_value: 232,
      inp_target: "button.add-to-cart",
      inp_type: "pointer",
      inp_rating: "good",
      inp_page: "/producto/agenda-rosa",
    });
  });

  it("without consent the library is never loaded", async () => {
    mocks.consent = false;
    render(<WebVitalsReporter sampleRate={1} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.onLCP).not.toHaveBeenCalled();
    expect(mocks.onINP).not.toHaveBeenCalled();
  });

  it("consent given on the banner later in the same load starts the measurement once", async () => {
    mocks.consent = false;
    render(<WebVitalsReporter sampleRate={0} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.onLCP).not.toHaveBeenCalled();

    mocks.consent = true;
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGED_EVENT));
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGED_EVENT));
    await registered();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.onLCP).toHaveBeenCalledTimes(1);
    expect(mocks.onINP).toHaveBeenCalledTimes(1);
  });

  it("skips reports from a back/forward cache restore", async () => {
    render(<WebVitalsReporter sampleRate={1} />);
    const { lcp, inp } = await registered();
    lcp(lcpMetric({ navigationType: "back-forward-cache" }));
    inp(inpMetric({ navigationType: "back-forward-cache" }));
    expect(mocks.trackGoogleEvent).not.toHaveBeenCalled();
  });

  it("a throwing report never escapes into the page", async () => {
    mocks.trackGoogleEvent.mockImplementation(() => {
      throw new Error("Java object is gone");
    });
    render(<WebVitalsReporter sampleRate={1} />);
    const { lcp } = await registered();
    expect(() => lcp(lcpMetric())).not.toThrow();
  });
});

describe("web vitals event params", () => {
  it("clips selectors and paths to the GA4 value limit and keeps only the host of the resource", () => {
    const longTarget = `div.${"x".repeat(200)} > button`;
    const inp = inpEventParams(inpMetric({ attribution: { interactionTarget: longTarget, interactionType: "keyboard" } }) as never, `/${"p".repeat(150)}`);
    expect(inp.inp_target).toHaveLength(GA4_PARAM_VALUE_LIMIT);
    expect(inp.inp_page).toHaveLength(GA4_PARAM_VALUE_LIMIT);
    expect(inp.inp_type).toBe("keyboard");

    const lcp = lcpEventParams(lcpMetric() as never, "/");
    expect(lcp.lcp_url_host).toBe("res.cloudinary.com");
    expect(JSON.stringify(lcp)).not.toContain("agenda.jpg");
  });

  it("labels text, data: and unknown LCP elements without failing", () => {
    const text = lcpEventParams(lcpMetric({ attribution: { timeToFirstByte: 1, resourceLoadDelay: 0, resourceLoadDuration: 0, elementRenderDelay: 5, lcpEntry: { element: { tagName: "H1" } } } }) as never, "/");
    expect(text).toMatchObject({ lcp_element: "h1", lcp_url_host: "(sin recurso)", lcp_load_duration: 0 });
    const inline = lcpEventParams(lcpMetric({ attribution: { url: "data:image/png;base64,AAA", timeToFirstByte: 1, resourceLoadDelay: 0, resourceLoadDuration: 0, elementRenderDelay: 0 } }) as never, "/");
    expect(inline).toMatchObject({ lcp_element: "(desconocido)", lcp_url_host: "data" });
    expect(inpEventParams(inpMetric({ attribution: {} }) as never, "/")).toMatchObject({ inp_target: "(desconocido)", inp_type: "(desconocido)" });
  });
});
