// Solo local: la administración en build de producción solo acepta CORS de los
// orígenes de producción (lib/cors.ts). La tienda local la llama por :3102, que
// presenta la petición como del origen de producción y devuelve el origen real.
import http from "node:http";

import { ADMIN_PORT, CORS_PORT } from "./paths.mjs";

http
  .createServer((req, res) => {
    const origin = req.headers.origin;
    const headers = { ...req.headers, host: `localhost:${ADMIN_PORT}` };
    if (origin) headers.origin = "https://papeleriapdepapel.com";
    const upstream = http.request({ host: "127.0.0.1", port: ADMIN_PORT, path: req.url, method: req.method, headers }, (response) => {
      const out = { ...response.headers };
      if (origin && out["access-control-allow-origin"]) out["access-control-allow-origin"] = origin;
      res.writeHead(response.statusCode, out);
      response.pipe(res);
    });
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(CORS_PORT, "127.0.0.1");
