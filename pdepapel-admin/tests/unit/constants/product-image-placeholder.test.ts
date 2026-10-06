import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PRODUCT_IMAGE_PLACEHOLDER } from "@/constants";

const root = join(__dirname, "../../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

describe("product image placeholder", () => {
  it("points to a file that exists in public/", () => {
    expect(existsSync(join(root, "public", PRODUCT_IMAGE_PLACEHOLDER))).toBe(true);
  });

  it("nothing references the missing /placeholder.png (it fell into [storeId] and called auth() outside the middleware)", () => {
    const offenders = ["app", "components", "lib"].flatMap((dir) => sourceFiles(join(root, dir))).filter((file) => readFileSync(file, "utf8").includes('"/placeholder.png"'));
    expect(offenders).toEqual([]);
  });
});
