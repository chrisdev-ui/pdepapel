/**
 * Aprueba UNA escritura en la base de producción.
 *
 *   npm run prod:approve -- "borrar el grupo de prueba 2b15bbdc y sus 3 movimientos de kardex"
 *
 * Sólo corre en una terminal con TTY: un agente sin terminal (Claude Code, CI)
 * no puede fabricar la aprobación, tiene que pedirla en el chat y esperar a
 * que una persona la ejecute. Escribe `.prod-write-approval.json` (ignorado
 * por git) con un token de un solo uso que vence a los 15 minutos; lo consume
 * `scripts/prod-write.mjs`.
 */
import { writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { createInterface } from "node:readline/promises";

import { APPROVAL_FILE, APPROVAL_TTL_MS, buildApproval } from "./lib/prod-guard.mjs";

const reason = process.argv.slice(2).join(" ").trim();

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error(
    "prod:approve necesita una terminal con TTY. Ábrela tú mismo y ejecútalo ahí; un agente no puede aprobar una escritura en producción.",
  );
  process.exit(2);
}

let approval;
try {
  approval = buildApproval({ reason, operator: userInfo().username });
} catch (error) {
  console.error(error.message);
  console.error('Uso: npm run prod:approve -- "qué se escribe y por qué"');
  process.exit(2);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(`\nMotivo: ${approval.reason}`);
console.log(`Vale ${APPROVAL_TTL_MS / 60000} minutos y para UNA sola ejecución de prod-write.`);
const answer = (await rl.question("¿Autorizas esta escritura en producción? Escribe «si» para confirmar: ")).trim().toLowerCase();
rl.close();

if (answer !== "si" && answer !== "sí") {
  console.log("No se aprobó nada.");
  process.exit(1);
}

writeFileSync(APPROVAL_FILE, `${JSON.stringify(approval, null, 2)}\n`, { mode: 0o600 });
console.log(`Aprobación guardada en ${APPROVAL_FILE} (vence ${approval.expiresAt}).`);
console.log("Ahora: npm run prod:write -- <ruta del guion> [argumentos]");
