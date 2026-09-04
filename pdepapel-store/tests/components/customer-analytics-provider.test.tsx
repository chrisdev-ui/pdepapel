// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_CONSENT_COOKIE_NAME,
  ANALYTICS_CONSENT_ENDPOINT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  serializeAnalyticsConsentCookie,
} from "@/lib/analytics-consent";
import { CustomerAnalyticsProvider } from "@/providers/customer-analytics-provider";

const analyticsMocks = vi.hoisted(() => ({
  disableGoogleAnalytics: vi.fn(),
  enableGoogleAnalytics: vi.fn(),
  trackGooglePageView: vi.fn(),
}));
const clarityMocks = vi.hoisted(() => ({
  configureMicrosoftClarity: vi.fn(),
  initializeMicrosoftClarity: vi.fn().mockResolvedValue(true),
  isClarityEligiblePath: vi.fn().mockReturnValue(true),
  updateMicrosoftClarityContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/tienda",
}));
vi.mock("@/lib/customer-analytics", () => analyticsMocks);
vi.mock("@/lib/microsoft-clarity", () => clarityMocks);

const BANNER_HEADING = "Tu privacidad, tus decisiones";

function renderProvider() {
  return render(
    <CustomerAnalyticsProvider
      measurementId="G-8X3M77ZB3Z"
      clarityProjectId="sc857ich8n"
      clarityEnabled
    />,
  );
}

describe("CustomerAnalyticsProvider", () => {
  let idleCallback: IdleRequestCallback | null;
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));

  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    document.cookie = `${ANALYTICS_CONSENT_COOKIE_NAME}=; Max-Age=0; path=/`;
    idleCallback = null;
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback;
        return 1;
      }),
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      value: vi.fn(),
    });
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps analytics disabled until the customer accepts", async () => {
    renderProvider();

    expect(
      await screen.findByRole("heading", { name: BANNER_HEADING }),
    ).toBeInTheDocument();
    expect(clarityMocks.initializeMicrosoftClarity).not.toHaveBeenCalled();
    expect(analyticsMocks.enableGoogleAnalytics).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Aceptar y continuar" }),
    );

    await waitFor(() => {
      expect(analyticsMocks.enableGoogleAnalytics).toHaveBeenCalledWith(
        "G-8X3M77ZB3Z",
      );
    });
    expect(
      JSON.parse(
        window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) ?? "{}",
      ),
    ).toMatchObject({ analytics: true });
    expect(fetchMock).toHaveBeenCalledWith(
      ANALYTICS_CONSENT_ENDPOINT,
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      screen.queryByRole("heading", { name: BANNER_HEADING }),
    ).not.toBeInTheDocument();

    act(() => {
      idleCallback?.({
        didTimeout: false,
        timeRemaining: () => 50,
      });
    });
    expect(clarityMocks.initializeMicrosoftClarity).toHaveBeenCalledTimes(1);
  });

  it("does not ask again a returning visitor who already accepted", async () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({
        analytics: true,
        updatedAt: "2026-08-27T17:52:42.293Z",
      }),
    );

    renderProvider();

    await waitFor(() => {
      expect(analyticsMocks.enableGoogleAnalytics).toHaveBeenCalledWith(
        "G-8X3M77ZB3Z",
      );
    });
    expect(
      screen.queryByRole("heading", { name: BANNER_HEADING }),
    ).not.toBeInTheDocument();
    expect(analyticsMocks.trackGooglePageView).toHaveBeenCalled();
    // The cookie mirror was missing, so the provider re-issues it silently.
    expect(fetchMock).toHaveBeenCalledWith(
      ANALYTICS_CONSENT_ENDPOINT,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("remembers a rejection without re-asking or loading providers", async () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({
        analytics: false,
        updatedAt: "2026-08-27T17:52:42.293Z",
      }),
    );

    renderProvider();

    await waitFor(() => {
      expect(analyticsMocks.disableGoogleAnalytics).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("heading", { name: BANNER_HEADING }),
    ).not.toBeInTheDocument();
    expect(analyticsMocks.enableGoogleAnalytics).not.toHaveBeenCalled();
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(clarityMocks.initializeMicrosoftClarity).not.toHaveBeenCalled();
  });

  it("restores the decision from the cookie when local storage was purged", async () => {
    const consent = {
      analytics: true,
      updatedAt: "2026-08-27T17:52:42.293Z",
    };
    document.cookie = `${ANALYTICS_CONSENT_COOKIE_NAME}=${serializeAnalyticsConsentCookie(consent)}; path=/`;

    renderProvider();

    await waitFor(() => {
      expect(analyticsMocks.enableGoogleAnalytics).toHaveBeenCalledWith(
        "G-8X3M77ZB3Z",
      );
    });
    expect(
      screen.queryByRole("heading", { name: BANNER_HEADING }),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) ?? "null",
      ),
    ).toEqual(consent);
    // The cookie is current, so no server round-trip is needed.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
