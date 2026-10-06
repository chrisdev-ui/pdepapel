// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ report: vi.fn(), recover: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/fonts", () => ({ caudex: { variable: "" }, fredoka: { variable: "" }, quicksand: { variable: "" } }));
vi.mock("@/lib/error-reporting", () => ({ reportBoundaryError: mocks.report, recoverFromChunkLoadError: mocks.recover }));

import RouteError from "@/app/(routes)/error";
import GlobalError from "@/app/global-error";
import { UpstreamUnavailable } from "@/components/upstream-unavailable";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.report.mockReset();
  mocks.recover.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("every store error boundary reports and tries to recover from chunk errors", () => {
  const error = Object.assign(new Error("Loading chunk 9 failed."), { name: "ChunkLoadError", digest: "d1" });

  it.each([
    ["routes", () => <RouteError error={error} reset={() => {}} />],
    ["upstream", () => <UpstreamUnavailable error={error} reset={() => {}} />],
  ] as const)("%s boundary", (name, ui) => {
    render(ui());
    expect(mocks.report).toHaveBeenCalledWith(error, name);
    expect(mocks.recover).toHaveBeenCalledWith(error);
  });

  it("global boundary", () => {
    // global-error renders its own <html>; only the effect matters here.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<GlobalError error={error} reset={() => {}} />, { container: document.documentElement });
    expect(mocks.report).toHaveBeenCalledWith(error, "global");
    expect(mocks.recover).toHaveBeenCalledWith(error);
  });
});
