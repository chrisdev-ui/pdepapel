/**
 * Rota los secretos propios (sin proveedor) del incidente Railway 2026-10-21.
 * Genera cada valor en memoria y lo carga por stdin, como Sensitive, en
 * Vercel (admin y, si aplica, tienda) y en GitHub. No imprime ningún valor.
 * Lo corre Christian desde pdepapel-admin; después, un deploy de los dos
 * proyectos en el mismo push (deploy-stamp de cada uno).
 *
 *   node scripts/rotation/rotate-app-secrets.mjs --only CRON_SECRET,REVALIDATION_SECRET
 *
 * Si un consumidor falla, se vuelve a correr ese secreto: el valor nuevo se
 * regenera y se carga en todos sus consumidores otra vez.
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pipeSecret } from "./lib.mjs";

const admin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const store = path.resolve(admin, "..", "pdepapel-store");

const vercel = (name, cwd) => ({
  label: `Vercel ${path.basename(cwd)} ${name} (Production, Sensitive)`,
  command: "vercel",
  args: ["env", "update", name, "production", "--sensitive", "-y"],
  cwd,
});
const github = (name) => ({ label: `GitHub ${name}`, command: "gh", args: ["secret", "set", name, "-R", "chrisdev-ui/pdepapel"] });

/** Solo los secretos cuyo único entorno en Vercel es Production; los demás se editan en el panel. */
export const APP_SECRETS = {
  CRON_SECRET: [vercel("CRON_SECRET", admin), github("PDEPAPEL_ADMIN_CRON_SECRET")],
  REVALIDATION_SECRET: [vercel("REVALIDATION_SECRET", admin), vercel("REVALIDATION_SECRET", store)],
  GOOGLE_MERCHANT_FEED_SECRET: [vercel("GOOGLE_MERCHANT_FEED_SECRET", admin)],
  NEWSLETTER_EARLY_ACCESS_SECRET: [vercel("NEWSLETTER_EARLY_ACCESS_SECRET", admin)],
};

export function generateSecret() {
  return randomBytes(32).toString("hex");
}

export function rotateAppSecrets(names, { run = pipeSecret, generate = generateSecret, log = console.log } = {}) {
  const results = [];
  for (const name of names) {
    const consumers = APP_SECRETS[name];
    if (!consumers) throw new Error(`secreto desconocido: ${name}`);
    const value = generate();
    const failed = [];
    for (const consumer of consumers) {
      const outcome = run({ command: consumer.command, args: consumer.args, value, secrets: [value], cwd: consumer.cwd });
      log(`${outcome.ok ? "ok" : "FALLÓ"}: ${consumer.label}${outcome.ok ? "" : ` (${outcome.detail})`}`);
      if (!outcome.ok) failed.push(consumer.label);
    }
    results.push({ name, ok: failed.length === 0, failed });
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const index = process.argv.indexOf("--only");
  const names = index >= 0 ? String(process.argv[index + 1] ?? "").split(",").filter(Boolean) : [];
  if (names.length === 0) {
    console.error(`rotate-app-secrets: --only ${Object.keys(APP_SECRETS).join(",")}`);
    process.exit(2);
  }
  const results = rotateAppSecrets(names);
  for (const result of results) console.log(`${result.name}: ${result.ok ? "rotado en todos sus consumidores" : `INCOMPLETO, vuelve a correrlo (${result.failed.join("; ")})`}`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
