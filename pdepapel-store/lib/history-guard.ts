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
 * La guarda queda siempre por fuera: es una propiedad con getter/setter en
 * `window.history`, así que si el navegador integrado vuelve a asignar
 * `history.pushState` después, su envoltorio pasa a ser el de adentro. Si el
 * de adentro lanza, se completa la navegación con el método nativo; si el
 * nativo también falla, el error original sigue su camino.
 *
 * Solo se instala en esos navegadores integrados: en los demás, cualquier
 * envoltorio de `pushState` estorba al de Next y al de nuqs.
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
      var inner = Object.prototype.hasOwnProperty.call(h, name) ? h[name] : null;
      var depth = 0;
      var guarded = function () {
        var args = arguments;
        // Next y los navegadores integrados guardan el método que encuentran
        // (esta guarda) y lo llaman desde el suyo: sin esto el ciclo
        // guarda → envoltorio → guarda se repite hasta desbordar la pila.
        if (depth > 0) return nativeFn.apply(this, args);
        var target = typeof inner === "function" ? inner : nativeFn;
        depth++;
        try {
          return target.apply(this, args);
        } catch (error) {
          if (target === nativeFn) throw error;
          try {
            var url = args.length > 2 ? args[2] : undefined;
            var already = url != null && new URL(String(url), window.location.href).href === window.location.href;
            // Si el envoltorio ya cambió la URL, solo se deja el estado de Next
            // en la entrada actual; si no, se hace la navegación que faltó.
            if (name === "pushState" && already) return proto.replaceState.apply(this, args);
            return nativeFn.apply(this, args);
          } catch (fallbackError) {
            throw error;
          }
        } finally {
          depth--;
        }
      };
      Object.defineProperty(h, name, {
        configurable: true,
        enumerable: true,
        get: function () { return guarded; },
        set: function (value) { if (value !== guarded) inner = value; },
      });
    });
    Object.defineProperty(h, "__pdpHistoryGuard", { value: true, configurable: true });
  } catch (e) {}
})();`;
