/**
 * Proxy TCP hacia la base de pruebas local que retrasa cada paquete D ms por
 * sentido (≈2·D por consulta, como desde un portátil a Railway). Sirve para
 * ensayar guiones de prod:write con la latencia real: el ensayo local a 0 ms
 * no ve los límites de transacción (2026-11-01).
 *
 *   node scripts/test-db-latency-proxy.mjs [puerto=3317] [destino=3307] [ms=50]
 *   node scripts/with-test-env.mjs bash -c 'DATABASE_URL="${DATABASE_URL/:3307\//:3317/}" npx tsx scripts/<guion>.ts …'
 */
import net from "node:net";

const [listen = "3317", target = "3307", delay = "50"] = process.argv.slice(2);
const delayMs = Number(delay);

net
  .createServer((client) => {
    const server = net.connect(Number(target), "127.0.0.1");
    const pipe = (from, to) => from.on("data", (chunk) => setTimeout(() => to.write(chunk), delayMs));
    pipe(client, server);
    pipe(server, client);
    const close = () => {
      client.destroy();
      server.destroy();
    };
    for (const socket of [client, server]) {
      socket.on("error", close);
      socket.on("close", close);
    }
  })
  .listen(Number(listen), "127.0.0.1", () => console.log(`proxy 127.0.0.1:${listen} → 127.0.0.1:${target}, ${delayMs} ms por sentido`));
