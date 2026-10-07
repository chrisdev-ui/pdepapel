import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ waitUntil: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil }));

import { runInBackground } from "@/lib/background";

/**
 * Incidente del 2026-10-07: el correo de un pedido iba en un `setImmediate`
 * que Vercel no espera; la instancia se congeló y el envío murió a medias.
 */
describe("runInBackground", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts the task right away and hands its promise to waitUntil", async () => {
    const task = vi.fn().mockResolvedValue("ok");
    runInBackground("prueba", task);
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
    const promise = mocks.waitUntil.mock.calls[0][0] as Promise<unknown>;
    await promise;
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("never throws: a failing task is logged, not propagated", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runInBackground("falla", () => Promise.reject(new Error("boom")));
    await expect(mocks.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("falla"), expect.any(Error));
    error.mockRestore();
  });
});

/** Guarda: nadie vuelve a dejar trabajo de servidor en un setImmediate. */
describe("no setImmediate in server code", () => {
  const root = resolve(__dirname, "../../..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.(ts|tsx|mjs)$/.test(name) ? [path] : [];
    });

  it("app/api and lib use runInBackground (waitUntil), never setImmediate", () => {
    const offenders = [...files(join(root, "app/api")), ...files(join(root, "lib"))]
      .filter((path) => /\bsetImmediate\s*\(/.test(readFileSync(path, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "")))
      .map((path) => relative(root, path));
    expect(offenders).toEqual([]);
  });
});
