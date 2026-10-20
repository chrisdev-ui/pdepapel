import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ningún correo sale como texto plano solo: cada envío literal a Resend
 * (`emails.send({...})`) lleva su plantilla (`react:`), y el texto plano va
 * aparte como alternativa. Un envío nuevo sin plantilla rompe esta prueba.
 */
const ROOTS = ["lib", "app"].map((dir) => path.resolve(__dirname, "../../..", dir));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** El argumento de cada `emails.send(` hasta su paréntesis de cierre. */
function sendCalls(source: string): string[] {
  const calls: string[] = [];
  let index = source.indexOf("emails.send(");
  while (index !== -1) {
    let depth = 0;
    let cursor = index + "emails.send".length;
    for (; cursor < source.length; cursor += 1) {
      if (source[cursor] === "(") depth += 1;
      else if (source[cursor] === ")" && --depth === 0) break;
    }
    calls.push(source.slice(index, cursor + 1));
    index = source.indexOf("emails.send(", cursor);
  }
  return calls;
}

describe("los correos usan la plantilla", () => {
  it("cada envío literal a Resend lleva `react`", () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(sourceFiles)) {
      const source = readFileSync(file, "utf8");
      for (const call of sendCalls(source)) {
        const literal = /emails\.send\(\s*\{/.test(call);
        // `...built.admin`: un `BuiltEmail`, cuyo tipo ya exige `react`.
        if (literal && !/\breact\b/.test(call) && !/\.\.\./.test(call)) offenders.push(`${path.relative(path.resolve(__dirname, "../../.."), file)}: ${call.slice(0, 80).replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
