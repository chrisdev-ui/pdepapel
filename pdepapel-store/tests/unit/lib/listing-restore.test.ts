// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeBackNavigation,
  LISTING_RESTORE_TTL_MS,
  listingKey,
  readListingState,
  saveListingState,
} from "@/lib/listing-restore";

describe("listing restore", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/tienda?typeId=t1&page=2");
    consumeBackNavigation();
  });
  afterEach(() => vi.restoreAllMocks());

  it("keys by path and query", () => {
    expect(listingKey()).toBe("/tienda?typeId=t1&page=2");
  });

  it("returns what was saved for the same listing within the time limit", () => {
    saveListingState({ visible: 24, lastPage: 2, scrollY: 1200 }, 1_000);
    expect(readListingState(1_000 + LISTING_RESTORE_TTL_MS - 1)).toEqual({ visible: 24, lastPage: 2, scrollY: 1200 });
    expect(readListingState(1_000 + LISTING_RESTORE_TTL_MS + 1)).toBeNull();
  });

  it("merges partial saves", () => {
    saveListingState({ visible: 24, lastPage: 1 }, 1_000);
    saveListingState({ scrollY: 900 }, 2_000);
    expect(readListingState(2_000)).toEqual({ visible: 24, lastPage: 1, scrollY: 900 });
  });

  it("does not hand one listing's state to another", () => {
    saveListingState({ visible: 24, lastPage: 1, scrollY: 900 }, 1_000);
    window.history.replaceState(null, "", "/tienda?typeId=t2");
    expect(readListingState(1_000)).toBeNull();
  });

  it("reports a back or forward navigation once, and only if it just happened", () => {
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(consumeBackNavigation()).toBe(true);
    expect(consumeBackNavigation()).toBe(false);

    vi.spyOn(Date, "now").mockReturnValue(10_000);
    window.dispatchEvent(new PopStateEvent("popstate"));
    vi.spyOn(Date, "now").mockReturnValue(20_000);
    expect(consumeBackNavigation()).toBe(false);
  });

  it("never throws when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveListingState({ scrollY: 10 })).not.toThrow();
    expect(readListingState()).toBeNull();
  });
});
