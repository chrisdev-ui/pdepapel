import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Los registros de Vercel no llevan datos de clientas (lib/log-redaction.ts). El guardián de valores
 * sensibles revisa literales; este revisa el código que registra: un `console.*` que pasa la petición
 * de EnvioClick, la respuesta de un proveedor o el objeto del pedido/clienta escribe nombre, correo,
 * celular y dirección en cada llamada (incidente 2026-11-03).
 */
const ROOT = path.resolve(__dirname, "../../..");
const SCAN_DIRS = ["lib", "app"];

const RISKY_ARGUMENT: { pattern: RegExp; why: string }[] = [
  { pattern: /(?<!shipmentLogSummary\()\b(requestParams|shipmentParams)\b/, why: "la petición de la guía (remitente y destinatario)" },
  { pattern: /\bfullError\b|Object\.getOwnPropertyNames\(/, why: "el error con todas sus propiedades" },
  { pattern: /\.(response|config)\??\.data\b/, why: "el cuerpo de la respuesta o de la petición HTTP" },
  { pattern: /JSON\.stringify\(\s*(params|data|body|payload|order|customer|request|response|destination|origin|recipient|buyer|payer)\b/, why: "un objeto de petición, respuesta o clienta serializado" },
  { pattern: /(^|[\s{,(])(origin|destination|customer|recipient|buyer|payer|shippingContact)\s*[:,}]/, why: "remitente, destinatario o clienta" },
  { pattern: /,\s*(order|customer|body|payload|params|shipping|shipmentParams|destination)\s*$/, why: "el objeto entero como argumento" },
];

/** Casos revisados: el nombre coincide pero lo registrado no lleva datos personales. */
const ALLOWED: Record<string, string> = {};

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".next"].includes(entry.name)) walk(full, files);
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

/** Los argumentos de cada console.*( … ), con paréntesis balanceados y sin contar los de cadenas. */
function consoleCalls(source: string): { line: number; args: string }[] {
  const calls: { line: number; args: string }[] = [];
  const opener = /\bconsole\.(log|info|warn|error|debug)\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    let depth = 1;
    let i = opener.lastIndex;
    let quote: string | null = null;
    for (; i < source.length && depth > 0; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    const args = source.slice(opener.lastIndex, i - 1);
    calls.push({ line: source.slice(0, match.index).split("\n").length, args });
  }
  return calls;
}

/** Quita el contenido de las cadenas: un nombre dentro del mensaje no es un dato registrado. */
const withoutStrings = (code: string) => code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '""');

describe("ningún registro escribe la petición, la respuesta ni el objeto de la clienta", () => {
  it("los console.* de lib/ y app/ pasan ids, referencias o safeError()", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file);
        for (const { line, args } of consoleCalls(fs.readFileSync(file, "utf8"))) {
          const code = withoutStrings(args).replace(/\s+/g, " ").trim();
          for (const { pattern, why } of RISKY_ARGUMENT) {
            if (pattern.test(code) && !ALLOWED[`${rel}:${line}`]) offenders.push(`${rel}:${line} — ${why}: ${code.slice(0, 120)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("el escáner reconoce las formas del incidente", () => {
    const leaky = [
      'console.error("[EnvioClick] Shipment creation failed:", { status: data.status, requestParams: params });',
      'console.log("[EnvioClick] Creating shipment with params:", JSON.stringify(params, null, 2));',
      'console.log("x", { orderId: order.id, origin: shipmentParams.origin, destination: shipmentParams.destination });',
      'console.error(`[EnvioClick] Error in ${method}:`, { response: error?.response?.data, fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2) });',
      'console.info("pedido", order);',
    ];
    for (const sample of leaky) {
      const [{ args }] = consoleCalls(sample);
      const code = withoutStrings(args).replace(/\s+/g, " ").trim();
      expect(RISKY_ARGUMENT.some(({ pattern }) => pattern.test(code)), sample).toBe(true);
    }
    const clean = ['console.error("[GUIDE] no se pudo crear la guía (origin, destination):", safeError(error));', 'console.log("[EnvioClick] Creating shipment:", shipmentLogSummary(params));'];
    for (const sample of clean) {
      const [{ args }] = consoleCalls(sample);
      const code = withoutStrings(args).replace(/\s+/g, " ").trim();
      expect(RISKY_ARGUMENT.some(({ pattern }) => pattern.test(code)), sample).toBe(false);
    }
  });
});
