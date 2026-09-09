/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import { forgetSearch, getRecentSearches, rememberSearch } from "@/lib/recent-searches";

describe("recent searches", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores the newest first without duplicates and keeps five", () => {
    ["agenda", "snoopy", "Agenda", "stickers", "washi", "llavero", "mug"].forEach(rememberSearch);
    expect(getRecentSearches()).toEqual(["mug", "llavero", "washi", "stickers", "Agenda"]);
  });

  it("ignores blank queries and forgets one entry", () => {
    rememberSearch("   ");
    expect(getRecentSearches()).toEqual([]);
    rememberSearch("agenda");
    rememberSearch("snoopy");
    expect(forgetSearch("agenda")).toEqual(["snoopy"]);
  });

  it("survives corrupted storage", () => {
    window.localStorage.setItem("pdp:busquedas-recientes", "{oops");
    expect(getRecentSearches()).toEqual([]);
  });
});
