import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * next.config.mjs redirects `/<segment>/new` to `/<segment>/nuevo` for every
 * entity in `newDashboardRoutePairs`. A page that only recognises "new" as
 * its create sentinel turns that redirect into a 404 (it happened to the six
 * attribute pages and boxes on 2026-09-18). Every redirected page must accept
 * "nuevo".
 */
const ROUTES = join(process.cwd(), "app/(dashboard)/[storeId]/(routes)");
const config = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");
const pairsBlock =
  config.match(/newDashboardRoutePairs = \[([\s\S]*?)\];/)?.[1] ?? "";
const segments = Array.from(
  pairsBlock.matchAll(/\[\s*"[^"]+",\s*"([^"]+)"\s*\]/g),
  (m) => m[1],
);

function findDynamicPage(segment: string): string | null {
  const dir = join(ROUTES, segment);
  const child = readdirSync(dir).find(
    (name) => name.startsWith("[") && statSync(join(dir, name)).isDirectory(),
  );
  return child ? join(dir, child, "page.tsx") : null;
}

describe("dashboard create routes", () => {
  it("lists every redirected entity", () => {
    expect(segments.length).toBeGreaterThanOrEqual(14);
  });

  it.each(segments)(
    "%s does not keep an English-only create sentinel",
    (segment) => {
      const page = findDynamicPage(segment);
      expect(page, `${segment}: no dynamic page`).not.toBeNull();
      const source = readFileSync(page!, "utf8");
      const englishOnly = /===\s*"new"/.test(source) && !/"nuevo"/.test(source);
      expect(
        englishOnly,
        `${segment}: page checks === "new" but never "nuevo"`,
      ).toBe(false);
    },
  );
});
