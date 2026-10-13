import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Next solo incrusta en el cliente las lecturas literales
 * `process.env.NEXT_PUBLIC_X`; un acceso dinámico (`process.env[name]`) llega
 * vacío al navegador sin ningún error.
 */
const source = readFileSync(path.resolve(__dirname, "../../../lib/public-env.ts"), "utf8");
const entries = Array.from(source.matchAll(/^\s+([A-Z_]+):\s*(.+?),$/gm)).map((match) => ({ key: match[1], value: match[2] }));

describe("lib/public-env.ts", () => {
  it("lists every public variable the client reads", () => {
    expect(entries.map((entry) => entry.key)).toEqual(
      expect.arrayContaining(["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "NEXT_PUBLIC_GA_MEASUREMENT_ID", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]),
    );
  });

  it("reads each one as a literal process.env.<same name>, never dynamically", () => {
    expect(source).not.toMatch(/process\.env\[/);
    for (const { key, value } of entries) {
      expect(value, key).toMatch(new RegExp(`^process\\.env\\.${key}\\b`));
    }
  });
});
