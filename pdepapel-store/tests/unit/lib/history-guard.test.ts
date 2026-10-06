// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { HISTORY_GUARD_SCRIPT } from "@/lib/history-guard";

/**
 * Incidente 2026-10-06: el navegador integrado de Instagram/Facebook envuelve
 * history.pushState y su puente lanza «Java object is gone». El router de Next
 * llama a pushState al abrir una ficha con clic y la tienda caía al error
 * boundary. La guarda tiene que dejar navegar en todos los órdenes posibles.
 */
const JAVA_GONE = "Error invoking postMessage: Java object is gone";
const install = () => new Function(HISTORY_GUARD_SCRIPT)();

/** El envoltorio del navegador integrado: llama al puente antes o después del nativo. */
const inAppWrapper = (original: History["pushState"], when: "before" | "after") =>
  function (this: History, ...args: Parameters<History["pushState"]>) {
    if (when === "before") throw new Error(JAVA_GONE);
    original.apply(this, args);
    throw new Error(JAVA_GONE);
  };

beforeEach(() => {
  // jsdom comparte window entre pruebas: se quita la guarda y se vuelve a /.
  for (const name of ["pushState", "replaceState", "__pdpHistoryGuard"]) delete (window.history as unknown as Record<string, unknown>)[name];
  History.prototype.replaceState.call(window.history, null, "", "/");
});

describe("history guard", () => {
  it("is a no-op for a normal browser", () => {
    install();
    window.history.pushState({ n: 1 }, "", "/tienda");
    expect(window.location.pathname).toBe("/tienda");
    expect(window.history.state).toEqual({ n: 1 });
    window.history.replaceState({ n: 2 }, "", "/carrito");
    expect(window.location.pathname).toBe("/carrito");
  });

  it.each(["before", "after"] as const)(
    "navigates when the in-app wrapper (assigned after the guard) throws %s calling the native method",
    (when) => {
      install();
      window.history.pushState = inAppWrapper(window.history.pushState, when);
      const length = window.history.length;
      expect(() => window.history.pushState({ tree: "producto" }, "", "/producto/mug")).not.toThrow();
      expect(window.location.pathname).toBe("/producto/mug");
      expect(window.history.state).toEqual({ tree: "producto" });
      // Sin entradas duplicadas: atrás vuelve a la página anterior.
      expect(window.history.length).toBe(length + 1);
    },
  );

  it("also works when the in-app browser wrapped pushState before the guard loaded", () => {
    window.history.pushState = inAppWrapper(History.prototype.pushState, "after");
    install();
    expect(() => window.history.pushState(null, "", "/producto/agenda")).not.toThrow();
    expect(window.location.pathname).toBe("/producto/agenda");
  });

  it("guards replaceState too", () => {
    install();
    window.history.replaceState = function () {
      throw new Error(JAVA_GONE);
    };
    expect(() => window.history.replaceState({ v: 1 }, "", "/tienda?page=2")).not.toThrow();
    expect(window.location.search).toBe("?page=2");
  });

  it("keeps real errors: a cross-origin URL still throws", () => {
    install();
    expect(() => window.history.pushState(null, "", "https://otro-sitio.example/x")).toThrow();
  });

  it("installs once and never throws on its own", () => {
    install();
    expect(() => install()).not.toThrow();
    window.history.pushState(null, "", "/nosotros");
    expect(window.location.pathname).toBe("/nosotros");
  });
});
