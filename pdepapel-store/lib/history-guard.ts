import { IN_APP_BROWSER_PATTERN } from "@/lib/in-app-browser";

/**
 * Guarda de `history.pushState` / `history.replaceState` para los navegadores
 * integrados de Android (Instagram, Facebook).
 *
 * Incidente 2026-10-06: esos navegadores envuelven `pushState` para seguir los
 * cambios de URL y su envoltorio llama a un puente JS↔Java. Cuando el objeto
 * Java ya no existe, el envoltorio lanza «Error invoking postMessage: Java
 * object is gone». El router de Next llama a `pushState` en cada navegación
 * con clic (tarjeta → ficha), el error sube al error boundary de la raíz y la
 * clienta ve «Algo salió mal de nuestro lado». Las cargas directas funcionan.
 *
 * Es una propiedad con getter/setter en `window.history`. Cada función que se
 * asigna (Next, nuqs, el navegador integrado) se apila como una capa sobre la
 * anterior, así que nadie saca a nadie de la cadena: Next sigue viendo las
 * URL que escribe nuqs. Si una capa lanza, la navegación sigue por la capa de
 * abajo; si ya cambió la URL antes de lanzar, no se repite. Una capa que se
 * vuelve a llamar a sí misma pasa directo a la de abajo, sin ciclos.
 *
 * Solo se instala en esos navegadores integrados: en los demás no hace falta
 * ninguna capa extra.
 *
 * Va como script en línea antes de hidratar, en JS simple (sin depender del
 * bundler), y nunca lanza.
 */
export const HISTORY_GUARD_SCRIPT = `(function () {
  try {
    if (!/${IN_APP_BROWSER_PATTERN.source}/.test(navigator.userAgent || "")) return;
    var h = window.history;
    if (!h || h.__pdpHistoryGuard) return;
    var proto = Object.getPrototypeOf(h);
    ["pushState", "replaceState"].forEach(function (name) {
      var nativeFn = proto && proto[name];
      if (typeof nativeFn !== "function") return;
      var layer = function (fn, below) {
        var active = false;
        return function () {
          var args = arguments;
          if (active) return below.apply(this, args);
          active = true;
          var before = window.location.href;
          try {
            return fn.apply(this, args);
          } catch (error) {
            if (fn === nativeFn) throw error;
            try {
              if (name === "pushState" && window.location.href !== before) return;
              return below.apply(this, args);
            } catch (fallbackError) {
              throw error;
            }
          } finally {
            active = false;
          }
        };
      };
      var top = nativeFn;
      if (Object.prototype.hasOwnProperty.call(h, name) && typeof h[name] === "function") {
        top = layer(h[name], nativeFn);
      }
      Object.defineProperty(h, name, {
        configurable: true,
        enumerable: true,
        get: function () { return top; },
        set: function (value) {
          if (typeof value !== "function" || value === top) return;
          top = layer(value, top);
        },
      });
    });
    Object.defineProperty(h, "__pdpHistoryGuard", { value: true, configurable: true });
  } catch (e) {}
})();`;
