import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Ningún componente de cliente llega a código de servidor.
 *
 * La tienda no tiene base de datos, pero sí módulos de servidor: los que leen
 * el panel con `server-only` (`lib/catalog-fetch.ts`, …), Clerk de servidor y
 * `next/headers`. Ni `tsc` ni las pruebas ven que uno se cuele al navegador;
 * solo rompe `next build`. Esta guarda (gemela de la del panel, 2026-10-25)
 * recorre el grafo de importaciones desde cada archivo `"use client"` (sin
 * `import type`, sin entrar en los `"use server"`, que el cliente llama por
 * red) y falla con la cadena completa si llega a algo de servidor.
 */
const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["app", "components", "hooks", "lib", "actions", "providers", "emails", "constants"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const FORBIDDEN_PACKAGES = new Set([
  "server-only",
  "@clerk/nextjs/server",
  "next/headers",
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
  "child_process",
  "node:child_process",
]);
const PRISMA_CLIENT = /\bnew\s+PrismaClient\s*\(/;

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
    return /\.(tsx?|jsx?|mjs|cjs)$/.test(name) && !/\.d\.ts$/.test(name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

interface Parsed {
  directive: "use client" | "use server" | null;
  specifiers: string[];
  importsServerOnly: boolean;
  createsPrismaClient: boolean;
}

const cache = new Map<string, Parsed>();

function parse(file: string): Parsed {
  const cached = cache.get(file);
  if (cached) return cached;
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const first = source.statements[0];
  const directive =
    first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && ["use client", "use server"].includes(first.expression.text)
      ? (first.expression.text as Parsed["directive"])
      : null;
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const bindings = clause?.namedBindings;
      const onlyTypes =
        clause && !clause.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
      if (onlyTypes) continue;
      specifiers.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly)) continue;
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require")) specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const parsed: Parsed = {
    directive,
    specifiers,
    importsServerOnly: specifiers.includes("server-only"),
    createsPrismaClient: PRISMA_CLIENT.test(text),
  };
  cache.set(file, parsed);
  return parsed;
}

function resolveLocal(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null;
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`))];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function serverMarker(file: string): string | null {
  const parsed = parse(file);
  if (parsed.importsServerOnly) return '"server-only"';
  if (parsed.createsPrismaClient) return "crea su propio PrismaClient";
  return null;
}

/**
 * Recorre el grafo desde todos los clientes a la vez. Cada arista que entra a
 * algo de servidor es un hallazgo aparte, con la cadena desde el cliente: así
 * un segundo camino hacia el mismo módulo no queda escondido detrás del primero.
 */
function findViolations(): { chains: string[]; clientCount: number } {
  const clients = DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir))).filter((file) => parse(file).directive === "use client");
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const client of clients) {
    parent.set(client, null);
    queue.push(client);
  }
  const chains = new Map<string, string>();
  const chainTo = (file: string, tail: string) => {
    const links: string[] = [tail];
    for (let at: string | null | undefined = file; at; at = parent.get(at)) links.unshift(rel(at));
    return links.join(" → ");
  };
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const specifier of parse(file).specifiers) {
      const target = resolveLocal(file, specifier);
      if (!target) {
        if (FORBIDDEN_PACKAGES.has(specifier)) chains.set(`${rel(file)}::${specifier}`, chainTo(file, specifier));
        continue;
      }
      // Una acción de servidor se llama por red: su código no viaja al navegador.
      if (parse(target).directive === "use server") continue;
      const marker = serverMarker(target);
      if (marker) {
        chains.set(`${rel(file)}::${rel(target)}`, chainTo(file, `${rel(target)} (${marker})`));
        continue;
      }
      if (parent.has(target)) continue;
      parent.set(target, file);
      queue.push(target);
    }
  }
  return { chains: Array.from(chains.values()).sort(), clientCount: clients.length };
}

describe("frontera cliente/servidor", () => {
  it("ningún archivo «use client» importa server-only, Clerk de servidor, next/headers, Prisma ni fs", () => {
    const { chains, clientCount } = findViolations();
    expect(clientCount).toBeGreaterThan(50);
    expect(chains, `Código de servidor alcanzable desde el navegador:\n${chains.join("\n")}`).toEqual([]);
  }, 60_000);

  it("los módulos que leen el panel siguen marcados server-only", () => {
    expect(parse(path.join(ROOT, "lib/catalog-fetch.ts")).importsServerOnly).toBe(true);
  });
});
