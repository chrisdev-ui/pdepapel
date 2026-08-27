// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ANALYTICS_CONSENT_STORAGE_KEY } from "@/lib/analytics-consent";
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

describe("CustomerAnalyticsProvider", () => {
  let idleCallback: IdleRequestCallback | null;

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
    vi.clearAllMocks();
  });

  it("keeps analytics disabled until the customer accepts", async () => {
    render(
      <CustomerAnalyticsProvider
        measurementId="G-8X3M77ZB3Z"
        clarityProjectId="sc857ich8n"
        clarityEnabled
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Tu privacidad, tus decisiones",
      }),
    ).toBeInTheDocument();
    expect(clarityMocks.initializeMicrosoftClarity).not.toHaveBeenCalled();
    expect(analyticsMocks.enableGoogleAnalytics).not.toHaveBeenCalled();

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

    act(() => {
      idleCallback?.({
        didTimeout: false,
        timeRemaining: () => 50,
      });
    });
    expect(clarityMocks.initializeMicrosoftClarity).toHaveBeenCalledTimes(1);
  });
});
