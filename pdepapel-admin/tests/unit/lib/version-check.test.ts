import { describe, expect, it } from "vitest";

import { isNewVersionAvailable, VERSION_POLL_MS } from "@/lib/version-check";

describe("isNewVersionAvailable", () => {
  it("avisa cuando el panel abierto es de otro despliegue", () => {
    expect(isNewVersionAvailable("aaa111", "bbb222")).toBe(true);
  });

  it("no avisa con la misma versión", () => {
    expect(isNewVersionAvailable("aaa111", "aaa111")).toBe(false);
  });

  it("no avisa sin commit propio (desarrollo local) ni sin respuesta del servidor", () => {
    expect(isNewVersionAvailable("", "bbb222")).toBe(false);
    expect(isNewVersionAvailable(undefined, "bbb222")).toBe(false);
    expect(isNewVersionAvailable("aaa111", null)).toBe(false);
    expect(isNewVersionAvailable("aaa111", "")).toBe(false);
  });

  it("revisa cada cinco minutos", () => {
    expect(VERSION_POLL_MS).toBe(5 * 60 * 1000);
  });
});
