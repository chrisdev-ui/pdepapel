import "@testing-library/jest-dom/vitest";

import { assertTestDatabaseEnv } from "../scripts/lib/test-database.mjs";

assertTestDatabaseEnv(process.env, "vitest (unitarias)");


if (typeof window !== "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock;
}
