import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** El portapapeles solo se toca desde `hooks/use-clipboard.ts`, que dice cuándo no pudo copiar. */
const ROOT = path.resolve(__dirname, "../..");
const DIRS = ["app", "components", "hooks", "lib", "providers"];
const ALLOWED = new Set(["hooks/use-clipboard.ts"]);

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}

describe("portapapeles", () => {
  it("nadie usa navigator.clipboard fuera de useClipboard/writeClipboard", () => {
    const offenders = DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
      .map((file) => ({ rel: path.relative(ROOT, file).split(path.sep).join("/"), text: readFileSync(file, "utf8") }))
      .filter(({ rel, text }) => !ALLOWED.has(rel) && /navigator\s*\.\s*clipboard\b/.test(text))
      .map(({ rel }) => rel);
    expect(offenders, "usa useClipboard o writeClipboard de @/hooks/use-clipboard").toEqual([]);
  });
});
