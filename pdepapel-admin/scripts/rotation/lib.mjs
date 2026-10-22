/**
 * Rotación de credenciales de MySQL sin caída (incidente Railway 2026-10-21).
 *
 * Reglas que cumplen todos los guiones de `scripts/rotation/`:
 * - la contraseña nace en memoria (`randomBytes`, como `openssl rand`) y nunca
 *   pasa por un argumento, un archivo de registro ni la salida estándar;
 * - el cambio usa `RETAIN CURRENT PASSWORD`: la contraseña vieja sigue valiendo
 *   como secundaria hasta `--phase discard`, así que ningún consumidor se cae
 *   mientras se actualiza;
 * - los consumidores (Vercel, Railway, GitHub, `.env` locales) reciben el valor
 *   por stdin; si uno falla, los ya cambiados vuelven al valor viejo cuando se
 *   conoce, y la base vuelve atrás.
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export function generatePassword() {
  return randomBytes(24).toString("hex");
}

/** Misma base, puerto, esquema y parámetros; solo cambian usuario y contraseña. */
export function withCredentials(baseUrl, user, password) {
  const url = new URL(baseUrl);
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(password);
  return url.toString();
}

export function passwordOf(url) {
  return decodeURIComponent(new URL(url).password);
}

export function databaseOf(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9_.%-]+$/;

export function accountName(user, host) {
  if (!SAFE_IDENTIFIER.test(user) || !SAFE_IDENTIFIER.test(host)) throw new Error(`cuenta con caracteres no admitidos: ${user}@${host}`);
  return `'${user}'@'${host}'`;
}

export function schemaName(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`esquema no admitido: ${name}`);
  return `\`${name}\``;
}

export function sqlLiteral(value) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f]/.test(value)) throw new Error("valor no admitido para un literal SQL");
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

export function redact(text, secrets) {
  let out = String(text ?? "");
  for (const secret of secrets.filter((s) => typeof s === "string" && s.length >= 6)) {
    out = out.split(secret).join("[oculto]");
    out = out.split(encodeURIComponent(secret)).join("[oculto]");
  }
  return out;
}

export async function accountHosts(db, user) {
  const rows = await db.$queryRawUnsafe("SELECT Host AS host FROM mysql.user WHERE User = ? ORDER BY Host", user);
  return rows.map((row) => String(row.host));
}

export async function hasSecondaryPassword(db, user, host) {
  const [row] = await db.$queryRawUnsafe(
    "SELECT JSON_EXTRACT(User_attributes, '$.additional_password') IS NOT NULL AS has FROM mysql.user WHERE User = ? AND Host = ?",
    user,
    host,
  );
  return Boolean(Number(row?.has ?? 0));
}

/** Abre una conexión nueva con esa URL y comprueba quién es. Nunca lanza ni imprime la URL. */
export async function canLogin(url, expectedUser, PrismaClient) {
  const client = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    const [row] = await client.$queryRawUnsafe("SELECT CURRENT_USER() AS cu");
    return String(row?.cu ?? "").startsWith(`${expectedUser}@`);
  } catch {
    return false;
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

/**
 * Entrega `value` por stdin. Lo que el comando imprima se tapa antes de mostrarlo.
 * @param {{ command: string, args: string[], value: string, secrets: string[], cwd?: string }} options
 */
export function pipeSecret({ command, args, value, secrets, cwd }) {
  const result = spawnSync(command, args, { input: value, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd });
  const tail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim().split("\n").slice(-2).join(" ");
  return { ok: !result.error && result.status === 0, detail: redact(result.error?.message ?? tail, secrets) };
}

/** Reemplaza el valor de `KEY=` en un archivo .env, con escritura atómica y permisos 600. */
export function replaceEnvValue(file, key, value) {
  const original = readFileSync(file, "utf8");
  const pattern = new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=\\s*)(["']?)(.*?)\\2\\s*$`, "m");
  if (!pattern.test(original)) throw new Error(`${key} no está en ${file}`);
  const updated = original.replace(pattern, (_m, prefix, quote) => `${prefix}${quote}${value}${quote}`);
  const tmp = `${file}.rotating`;
  writeFileSync(tmp, updated, { mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

export function readEnvValue(file, key) {
  const match = readFileSync(file, "utf8").match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*["']?([^"'\\s]+)`, "m"));
  if (!match) throw new Error(`${key} no está en ${file}`);
  return match[1];
}

/**
 * Corre los consumidores en orden. Si uno falla, devuelve los anteriores al
 * valor viejo (cuando `oldValue` existe) y responde cuáles quedaron cómo.
 */
export function updateConsumers(consumers, { secrets, log }) {
  const done = [];
  for (const consumer of consumers) {
    const outcome = consumer.apply(consumer.newValue);
    if (outcome.ok) {
      log(`ok: ${consumer.label}`);
      done.push(consumer);
      continue;
    }
    log(`FALLÓ: ${consumer.label} (${redact(outcome.detail, secrets)})`);
    const reverted = [];
    const stuck = [];
    for (const previous of done.reverse()) {
      if (previous.oldValue === undefined) {
        stuck.push(previous.label);
        continue;
      }
      const back = previous.apply(previous.oldValue);
      (back.ok ? reverted : stuck).push(previous.label);
    }
    return { ok: false, failed: consumer.label, reverted, stuck };
  }
  return { ok: true };
}
