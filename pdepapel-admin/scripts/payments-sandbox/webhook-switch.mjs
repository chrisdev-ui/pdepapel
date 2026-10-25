// Túnel → :3011 → administración :3101. Con el archivo tmp/payments-sandbox/BLOCKED
// presente responde 503 sin tocar la administración: la pasarela reintenta a la
// misma URL (caso «webhook caído»). Cada petición queda en webhook-switch.jsonl.
import http from "node:http";
import { appendFileSync, existsSync } from "node:fs";

import { ADMIN_PORT, SWITCH_PORT, WORK } from "./paths.mjs";

http
  .createServer((req, res) => {
    const blocked = existsSync(WORK + "BLOCKED");
    const note = (status) =>
      appendFileSync(WORK + "webhook-switch.jsonl", JSON.stringify({ at: new Date().toISOString(), method: req.method, path: req.url.split("?")[0], status, blocked }) + "\n");
    if (blocked) {
      res.writeHead(503);
      res.end("bloqueado");
      note(503);
      return;
    }
    const upstream = http.request(
      { host: "127.0.0.1", port: ADMIN_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${ADMIN_PORT}` } },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
        note(response.statusCode);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
      note(502);
    });
    req.pipe(upstream);
  })
  .listen(SWITCH_PORT, "127.0.0.1");
