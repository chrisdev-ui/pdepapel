// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const INSTAGRAM_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.31.98";
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const setUserAgent = (value: string) => Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });

beforeEach(() => {
  setUserAgent(INSTAGRAM_UA);
  // jsdom comparte window entre pruebas: se quita la guarda y se vuelve a /.
  for (const name of ["pushState", "replaceState", "__pdpHistoryGuard"]) delete (window.history as unknown as Record<string, unknown>)[name];
  History.prototype.replaceState.call(window.history, null, "", "/");
});

/** Lo que hace el router de Next 14.2 al montar: guarda el método actual y lo reemplaza por su parche. */
const patchLikeNext = (name: "pushState" | "replaceState") => {
  const original = window.history[name].bind(window.history);
  window.history[name] = function (data: unknown, unused: string, url?: string | URL | null) {
    const state = data && typeof data === "object" && "__NA" in data ? data : { ...(data as object), __NA: true };
    return original(state, unused, url);
  };
  return original;
};

afterEach(() => vi.restoreAllMocks());

describe("history guard", () => {
  it("only installs inside Instagram and Facebook in-app browsers", () => {
    setUserAgent(SAFARI_UA);
    install();
    expect(Object.prototype.hasOwnProperty.call(window.history, "pushState")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(window.history, "__pdpHistoryGuard")).toBe(false);

    setUserAgent(INSTAGRAM_UA);
    install();
    expect(Object.prototype.hasOwnProperty.call(window.history, "__pdpHistoryGuard")).toBe(true);
  });

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

  it.each(["pushState", "replaceState"] as const)(
    "calls the native %s once when Next patches it after the guard",
    (name) => {
      const native = vi.spyOn(History.prototype, name);
      install();
      patchLikeNext(name);
      window.history[name](null, "", "/producto/cartuchera-azul");
      expect(native).toHaveBeenCalledTimes(1);
      expect(window.location.pathname).toBe("/producto/cartuchera-azul");
      expect(window.history.state).toEqual({ __NA: true });
    },
  );

  it("calls the native pushState once after Next restores its saved method on unmount", () => {
    const native = vi.spyOn(History.prototype, "pushState");
    install();
    const saved = patchLikeNext("pushState");
    window.history.pushState = saved;
    window.history.pushState({ n: 1 }, "", "/tienda");
    expect(native).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/tienda");
  });

  it("calls the native pushState once when the in-app wrapper wraps the guard", () => {
    const native = vi.spyOn(History.prototype, "pushState");
    install();
    window.history.pushState = inAppWrapper(window.history.pushState, "after");
    const length = window.history.length;
    expect(() => window.history.pushState(null, "", "/producto/mug")).not.toThrow();
    expect(native).toHaveBeenCalledTimes(1);
    expect(window.history.length).toBe(length + 1);
  });

  it.each(["pushState", "replaceState"] as const)(
    "keeps Next's and nuqs's patches chained for %s (nuqs writes null state)",
    (name) => {
      const native = vi.spyOn(History.prototype, name);
      install();
      const calls: string[] = [];
      const nextOriginal = window.history[name].bind(window.history);
      window.history[name] = function (data: unknown, unused: string, url?: string | URL | null) {
        calls.push("next");
        const state = data && typeof data === "object" && "__NA" in data ? data : { ...(data as object), __NA: true };
        return nextOriginal(state, unused, url);
      };
      const nuqsOriginal = window.history[name].bind(window.history);
      window.history[name] = function (data: unknown, unused: string, url?: string | URL | null) {
        calls.push("nuqs");
        return nuqsOriginal(data, unused, url);
      };

      window.history[name](null, "", "/tienda?typeId=cuadernos");

      expect(calls).toEqual(["nuqs", "next"]);
      expect(native).toHaveBeenCalledTimes(1);
      expect(window.location.search).toBe("?typeId=cuadernos");
      expect(window.history.state).toEqual({ __NA: true });
    },
  );

  it("falls back to the layer below when the in-app wrapper throws after Next and nuqs patched", () => {
    const native = vi.spyOn(History.prototype, "pushState");
    install();
    const calls: string[] = [];
    const nextOriginal = window.history.pushState.bind(window.history);
    window.history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
      calls.push("next");
      return nextOriginal({ ...(data as object), __NA: true }, unused, url);
    };
    window.history.pushState = function () {
      throw new Error(JAVA_GONE);
    };

    expect(() => window.history.pushState(null, "", "/producto/mug")).not.toThrow();
    expect(calls).toEqual(["next"]);
    expect(native).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({ __NA: true });
  });
});
