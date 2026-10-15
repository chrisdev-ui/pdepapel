// Se carga con `--import` en el servidor de las e2e (desarrollo y build de
// producción): nada sale a la red salvo la máquina local y Clerk de desarrollo.
//
// Con `E2E_NETWORK_LOG=<archivo>` además anota cada intento bloqueado, para
// saber qué habría salido: host, método y ruta (sin query); de Upstash, el
// comando y la clave (los números largos enmascarados, nunca el valor); de la
// revalidación de la tienda, las etiquetas o rutas pedidas.
import { appendFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

import { blockOutboundNetwork, isAllowedHost, isLocalHost } from "./test-isolation.mjs";

const ALLOW = ["clerk.accounts.dev", "api.clerk.com", "api.clerk.dev"];
blockOutboundNetwork({ allowHosts: ALLOW });

const logFile = process.env.E2E_NETWORK_LOG;
if (logFile) {
  const external = (host) => host && !isLocalHost(host) && !isAllowedHost(host, ALLOW);
  const mask = (value) => String(value).replace(/\d{7,}/g, "#");
  const record = (entry) => {
    try {
      appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
    } catch {}
  };
  const describeBody = (host, path, body) => {
    if (typeof body !== "string") return {};
    try {
      const parsed = JSON.parse(body);
      if (/upstash/.test(host)) {
        const commands = Array.isArray(parsed[0]) ? parsed : [parsed];
        return { redis: commands.map((command) => [String(command[0]).toUpperCase(), command[1] === undefined ? null : mask(command[1])]) };
      }
      if (path.includes("revalidate")) return { revalidate: { tags: parsed.tags ?? null, paths: parsed.paths ?? parsed.path ?? null } };
    } catch {}
    return {};
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = function fetch(input, init) {
    try {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (external(url.hostname)) {
        const path = /upstash/.test(url.hostname) ? url.pathname.split("/").slice(0, 2).join("/") : url.pathname;
        record({ via: "fetch", method: (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase(), host: url.hostname, path: mask(path), ...describeBody(url.hostname, url.pathname, init?.body) });
      }
    } catch {}
    return originalFetch.call(this, input, init);
  };

  for (const [name, module] of [["http", http], ["https", https]]) {
    const original = module.request;
    module.request = function request(...args) {
      try {
        const first = args[0];
        const options = typeof first === "string" || first instanceof URL ? new URL(first) : first ?? {};
        const host = options.hostname ?? options.host;
        const second = args[1] && typeof args[1] === "object" && !(args[1] instanceof Function) ? args[1] : {};
        if (external(host)) record({ via: name, method: String(second.method ?? options.method ?? "GET").toUpperCase(), host, path: mask(String(second.path ?? options.path ?? options.pathname ?? "/").split("?")[0]) });
      } catch {}
      return original.apply(this, args);
    };
  }
}
