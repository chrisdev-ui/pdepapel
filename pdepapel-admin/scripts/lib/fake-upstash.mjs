/**
 * Redis de Upstash falso, en memoria y en la máquina local, para los
 * servidores de las e2e. Sin él, Upstash apunta a un host bloqueado y cada
 * llamada reintenta unos segundos: un checkout tardaba más de un minuto y la
 * prueba se caía por tiempo. Con él, la caché, la idempotencia y los límites
 * de pedidos funcionan de verdad durante la corrida y nada sale de la máquina.
 */
import http from "node:http";

function createStore() {
  const values = new Map();
  const expiresAt = new Map();
  const alive = (key) => {
    const at = expiresAt.get(key);
    if (at !== undefined && at <= Date.now()) {
      values.delete(key);
      expiresAt.delete(key);
    }
    return values.has(key);
  };
  const globToRegExp = (pattern) => new RegExp(`^${String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);

  const run = ([command, ...args]) => {
    switch (String(command).toUpperCase()) {
      case "PING":
        return "PONG";
      case "GET":
        return alive(args[0]) ? values.get(args[0]) : null;
      case "MGET":
        return args.map((key) => (alive(key) ? values.get(key) : null));
      case "SET": {
        const [key, value, ...options] = args;
        const flags = options.map((option) => String(option).toUpperCase());
        if (flags.includes("NX") && alive(key)) return null;
        if (flags.includes("XX") && !alive(key)) return null;
        values.set(key, value);
        expiresAt.delete(key);
        const ex = flags.indexOf("EX");
        const px = flags.indexOf("PX");
        if (ex >= 0) expiresAt.set(key, Date.now() + Number(options[ex + 1]) * 1000);
        if (px >= 0) expiresAt.set(key, Date.now() + Number(options[px + 1]));
        return "OK";
      }
      case "DEL":
      case "UNLINK":
        return args.reduce((count, key) => count + (alive(key) && values.delete(key) ? 1 : 0), 0);
      case "EXISTS":
        return args.filter((key) => alive(key)).length;
      case "INCR":
      case "INCRBY": {
        const next = Number(alive(args[0]) ? values.get(args[0]) : 0) + (String(command).toUpperCase() === "INCRBY" ? Number(args[1]) : 1);
        values.set(args[0], String(next));
        return next;
      }
      case "EXPIRE":
      case "PEXPIRE": {
        if (!alive(args[0])) return 0;
        const ms = Number(args[1]) * (String(command).toUpperCase() === "EXPIRE" ? 1000 : 1);
        expiresAt.set(args[0], Date.now() + ms);
        return 1;
      }
      case "TTL": {
        if (!alive(args[0])) return -2;
        const at = expiresAt.get(args[0]);
        return at === undefined ? -1 : Math.ceil((at - Date.now()) / 1000);
      }
      case "SCAN": {
        const options = args.slice(1).map((option) => String(option));
        const matchAt = options.findIndex((option) => option.toUpperCase() === "MATCH");
        const pattern = matchAt >= 0 ? globToRegExp(options[matchAt + 1]) : null;
        const keys = [...values.keys()].filter((key) => alive(key) && (!pattern || pattern.test(key)));
        return ["0", keys];
      }
      case "KEYS": {
        const pattern = globToRegExp(args[0] ?? "*");
        return [...values.keys()].filter((key) => alive(key) && pattern.test(key));
      }
      default:
        return null;
    }
  };
  return { run };
}

/** Lo que el cliente pide con `Upstash-Encoding: base64`: cada texto en base64, salvo "OK". */
function encodeResult(value) {
  if (typeof value === "string") return value === "OK" ? value : Buffer.from(value, "utf8").toString("base64");
  if (Array.isArray(value)) return value.map(encodeResult);
  return value;
}

/** Arranca el Redis falso en un puerto libre de 127.0.0.1 y devuelve su URL. */
export function startFakeUpstash() {
  const store = createStore();
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      let parsed = [];
      try {
        parsed = JSON.parse(body || "[]");
      } catch {}
      const batch = request.url?.startsWith("/pipeline") || request.url?.startsWith("/multi-exec");
      const base64 = String(request.headers["upstash-encoding"] ?? "").toLowerCase() === "base64";
      const answer = (command) => {
        const result = store.run(command);
        return base64 ? encodeResult(result) : result;
      };
      const payload = batch ? parsed.map((command) => ({ result: answer(command) })) : { result: answer(parsed) };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

/** El entorno del servidor de las e2e con Upstash apuntando al Redis falso. */
export function withFakeUpstash(env, url) {
  return { ...env, UPSTASH_REDIS_REST_URL: url, KV_REST_API_URL: url };
}
