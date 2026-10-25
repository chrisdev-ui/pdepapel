import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El portapapeles solo se toca desde `hooks/use-clipboard.tsx`. Una llamada
 * directa a `navigator.clipboard.writeText` no se entera si el navegador niega
 * el permiso, y la pantalla decía «copiado» sin haber copiado nada.
 */
const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["app", "components", "hooks", "lib", "actions", "providers"];
const ALLOWED = new Set(["hooks/use-clipboard.tsx"]);

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

  it("el hook sigue siendo quien escribe", () => {
    expect(readFileSync(path.join(ROOT, "hooks/use-clipboard.tsx"), "utf8")).toMatch(/navigator\.clipboard\.writeText/);
  });
});
