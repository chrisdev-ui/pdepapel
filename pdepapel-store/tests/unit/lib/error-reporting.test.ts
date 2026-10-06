// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consent = vi.hoisted(() => ({ granted: false }));
vi.mock("@/lib/analytics-consent", () => ({ hasAnalyticsConsent: () => consent.granted }));

import {
  CHUNK_RELOAD_STORAGE_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  describeBoundaryError,
  isChunkLoadError,
  recoverFromChunkLoadError,
  reportBoundaryError,
} from "@/lib/error-reporting";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("isChunkLoadError", () => {
  it("recognises webpack, Safari, Firefox and Chrome chunk failures", () => {
    const chunk = Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" });
    expect(isChunkLoadError(chunk)).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/_next/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk app-layout failed"))).toBe(true);
  });

  it("ignores everything else", () => {
    expect(isChunkLoadError(new Error("Error invoking postMessage: Java object is gone"))).toBe(false);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("Loading chunk 1 failed")).toBe(false);
  });
});

describe("reportBoundaryError", () => {
  const gtag = vi.fn();
  beforeEach(() => {
    gtag.mockReset();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    window.history.replaceState(null, "", "/producto/mug?utm=x");
  });
  afterEach(() => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    consent.granted = false;
  });

  it("sends a GA4 exception with name, short message, path and digest when analytics is allowed", () => {
    consent.granted = true;
    const error = Object.assign(new Error(`Java object is gone ${"x".repeat(200)}`), { digest: "abc123" });
    reportBoundaryError(error, "routes");
    expect(gtag).toHaveBeenCalledWith("event", "exception", {
      description: describeBoundaryError(error),
      fatal: true,
      page_path: "/producto/mug",
      error_digest: "abc123",
      error_boundary: "routes",
    });
    const [, , params] = gtag.mock.calls[0];
    expect(params.description.length).toBeLessThanOrEqual(100);
    expect(params.description.startsWith("Error: Java object is gone")).toBe(true);
    expect(JSON.stringify(params)).not.toContain("utm");
  });

  it("sends nothing without analytics consent", () => {
    reportBoundaryError(new Error("boom"), "global");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("never throws, even if gtag does", () => {
    consent.granted = true;
    gtag.mockImplementation(() => {
      throw new Error("gtag roto");
    });
    expect(() => reportBoundaryError(new Error("boom"), "upstream")).not.toThrow();
  });
});

describe("recoverFromChunkLoadError", () => {
  const chunk = Object.assign(new Error("Loading chunk 7 failed."), { name: "ChunkLoadError" });

  it("reloads once and not again inside the window (no loops)", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    expect(recoverFromChunkLoadError(chunk, { storage, reload, now: 1_000 })).toBe(true);
    expect(recoverFromChunkLoadError(chunk, { storage, reload, now: 2_000 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBe("1000");
  });

  it("can reload again after the window (a later deploy in the same session)", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    recoverFromChunkLoadError(chunk, { storage, reload, now: 1_000 });
    expect(recoverFromChunkLoadError(chunk, { storage, reload, now: 1_000 + CHUNK_RELOAD_WINDOW_MS + 1 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload for other errors or without usable storage", () => {
    const reload = vi.fn();
    expect(recoverFromChunkLoadError(new Error("otra cosa"), { storage: memoryStorage(), reload })).toBe(false);
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} };
    expect(recoverFromChunkLoadError(chunk, { storage: blocked, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
