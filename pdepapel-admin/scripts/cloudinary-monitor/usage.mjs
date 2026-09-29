#!/usr/bin/env node
/**
 * Seguimiento diario del consumo de Cloudinary (créditos del ciclo).
 *
 * Guion independiente: no importa nada de la app, así que nunca puede
 * acabar en un paquete del navegador. Habla con el Admin API por REST con
 * `fetch` (sin SDK) y con una credencial propia, `CLOUDINARY_URL`, que vive
 * en `scripts/cloudinary-monitor/.env` (ignorado por git), nunca en el `.env`
 * de la app.
 *
 *   npm run cloudinary:usage            # desde pdepapel-admin
 *   node --env-file=scripts/cloudinary-monitor/.env scripts/cloudinary-monitor/usage.mjs
 *
 * Cada corrida añade una fila a `usage-log.csv`, una entrada a
 * `monitoring-log.md` y escribe en stdout una línea de proyección: si al
 * ritmo medio de créditos por día de este ciclo se superarían los créditos
 * del plan gratuito al cabo de 30 días.
 *
 * Regla dura (incidente del 18 de septiembre: el secreto salió en un log):
 * la credencial se lee una vez, se guarda en una clausura y todo lo que se
 * imprime, se registra o se escribe en disco pasa antes por `redact()`, que
 * borra la clave, el secreto y cualquier URL `cloudinary://`. El error crudo
 * del transporte nunca llega a stdout, a un archivo ni a un commit.
 *
 * Variables opcionales en el mismo `.env`:
 *   FREE_TIER_CREDITS   créditos del plan gratuito contra el que se proyecta (28)
 *   CYCLE_DAYS          duración del ciclo en días (30)
 *   BILLING_CYCLE_START fecha AAAA-MM-DD en que empezó el ciclo actual; si
 *                       falta, se toma el día 1 del mes en curso (UTC)
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(here, "usage-log.csv");
const MD_PATH = join(here, "monitoring-log.md");
const ERROR_LOG_PATH = join(here, "monitor-errors.log");
const CSV_HEADER =
  "date,transformations_credits,bandwidth_credits,storage_credits,total_credits,pct_of_free_quota,transformations,bandwidth_bytes,storage_bytes,requests,plan,plan_credit_limit,day_of_cycle,projected_cycle_credits,projection_flag";

// ---------------------------------------------------------------------------
// Credencial y redacción
// ---------------------------------------------------------------------------

/**
 * Lee CLOUDINARY_URL y devuelve solo lo necesario para llamar, más una
 * función `redact` que borra la clave y el secreto de cualquier texto.
 * La URL completa no se guarda en ninguna variable de módulo.
 */
function loadCredential() {
  const raw = process.env.CLOUDINARY_URL ?? "";
  const match = raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)/);
  if (!match) {
    return {
      ok: false,
      redact: (text) => String(text).replace(/cloudinary:\/\/\S+/g, "cloudinary://[redactado]"),
    };
  }
  const [, apiKey, apiSecret, cloudName] = match;
  const secrets = [raw, apiSecret, apiKey].filter((value) => value && value.length >= 4);
  const redact = (text) => {
    let out = String(text);
    for (const secret of secrets) out = out.split(secret).join("[redactado]");
    return out
      .replace(/cloudinary:\/\/\S+/g, "cloudinary://[redactado]")
      .replace(/Basic\s+[A-Za-z0-9+/=]{8,}/g, "Basic [redactado]");
  };
  const authorization = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
  return { ok: true, cloudName, authorization, redact };
}

/** Un error del Admin API o del transporte, ya limpio de credenciales. */
class MonitorError extends Error {
  constructor(message, { status = null, retryAfter = null } = {}) {
    super(message);
    this.name = "MonitorError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

async function fetchUsage({ cloudName, authorization, redact }) {
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/usage`;
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: authorization, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    // Un fallo de red o un timeout: el objeto de error puede arrastrar la
    // petición entera, así que solo viaja el mensaje, y redactado.
    throw new MonitorError(`sin respuesta del Admin API: ${redact(error?.message ?? error)}`);
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    let detail = "";
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error?.message ?? "";
    } catch {
      detail = text.slice(0, 200);
    }
    const kind =
      response.status === 401 ? "credencial rechazada (401)"
        : response.status === 403 ? "sin permiso (403)"
          : response.status === 420 || response.status === 429 ? `límite de llamadas (${response.status})`
            : `HTTP ${response.status}`;
    throw new MonitorError(`${kind}${detail ? `: ${redact(detail)}` : ""}`, {
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new MonitorError("respuesta del Admin API no es JSON");
  }
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const gb = (bytes) => round(bytes / 1e9, 2);

function cycleStart(now) {
  const configured = process.env.BILLING_CYCLE_START;
  if (configured && /^\d{4}-\d{2}-\d{2}$/.test(configured)) {
    const start = new Date(`${configured}T00:00:00Z`);
    if (!Number.isNaN(start.getTime()) && start <= now) return { start, source: "BILLING_CYCLE_START" };
  }
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), source: "día 1 del mes (UTC)" };
}

function buildSnapshot(usage, now = new Date()) {
  const freeTierCredits = Number(process.env.FREE_TIER_CREDITS) || 28;
  const cycleDays = Number(process.env.CYCLE_DAYS) || 30;
  const { start, source } = cycleStart(now);
  // El día 1 del ciclo cuenta como día 1, no 0: la media nunca divide por cero.
  const dayOfCycle = Math.max(1, Math.floor((now - start) / 86_400_000) + 1);

  const transformationsCredits = num(usage.transformations?.credits_usage);
  const bandwidthCredits = num(usage.bandwidth?.credits_usage);
  const storageCredits = num(usage.storage?.credits_usage);
  const totalCredits = num(usage.credits?.usage) || transformationsCredits + bandwidthCredits + storageCredits;
  const projected = (totalCredits / dayOfCycle) * cycleDays;
  const projectedPct = (projected / freeTierCredits) * 100;
  const wouldExceed = projected > freeTierCredits;

  return {
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 16),
    plan: usage.plan ?? "",
    planCreditLimit: num(usage.credits?.limit),
    lastUpdated: usage.last_updated ?? "",
    transformations: num(usage.transformations?.usage),
    transformationsCredits: round(transformationsCredits),
    bandwidthBytes: num(usage.bandwidth?.usage),
    bandwidthCredits: round(bandwidthCredits),
    storageBytes: num(usage.storage?.usage),
    storageCredits: round(storageCredits),
    totalCredits: round(totalCredits),
    requests: num(usage.requests),
    freeTierCredits,
    pctOfFree: round((totalCredits / freeTierCredits) * 100, 1),
    cycleDays,
    cycleStart: start.toISOString().slice(0, 10),
    cycleStartSource: source,
    dayOfCycle,
    projectedCredits: round(projected),
    projectedPct: round(projectedPct, 1),
    wouldExceed,
    flag: wouldExceed
      ? `WOULD EXCEED FREE TIER, projected ${round(projectedPct, 1)}%`
      : `OK, projected ${round(projectedPct, 1)}%`,
  };
}

// ---------------------------------------------------------------------------
// Salidas
// ---------------------------------------------------------------------------

function appendCsv(s) {
  if (!existsSync(CSV_PATH)) writeFileSync(CSV_PATH, `${CSV_HEADER}\n`);
  const row = [
    s.date,
    s.transformationsCredits,
    s.bandwidthCredits,
    s.storageCredits,
    s.totalCredits,
    s.pctOfFree,
    s.transformations,
    s.bandwidthBytes,
    s.storageBytes,
    s.requests,
    s.plan,
    s.planCreditLimit,
    s.dayOfCycle,
    s.projectedCredits,
    s.wouldExceed ? "WOULD_EXCEED_FREE_TIER" : "OK",
  ].join(",");
  appendFileSync(CSV_PATH, `${row}\n`);
}

function appendMarkdown(s) {
  const header = existsSync(MD_PATH)
    ? ""
    : "# Seguimiento diario de créditos de Cloudinary\n\nUna entrada por corrida de `scripts/cloudinary-monitor/usage.mjs`. Los créditos son los del ciclo en curso según el Admin API (`last_updated` va con un día de retraso).\n";
  const entry = [
    "",
    `## ${s.date} ${s.time} UTC · día ${s.dayOfCycle} de ${s.cycleDays} (ciclo desde ${s.cycleStart}, ${s.cycleStartSource}) · plan ${s.plan || "?"}`,
    "",
    "| Periodo | Transformaciones | Ancho de banda | Almacenamiento | Total |",
    "|---|---|---|---|---|",
    `| Ciclo hasta ${s.lastUpdated || s.date} | ${s.transformations.toLocaleString("es-CO")} (${s.transformationsCredits} cr) | ${gb(s.bandwidthBytes)} GB (${s.bandwidthCredits} cr) | ${gb(s.storageBytes)} GB (${s.storageCredits} cr) | **${s.totalCredits} cr · ${s.pctOfFree} % de ${s.freeTierCredits}** |`,
    "",
    `Proyección a ${s.cycleDays} días al ritmo medio actual: **${s.projectedCredits} cr → ${s.flag}**. Peticiones del ciclo: ${s.requests.toLocaleString("es-CO")}. Límite del plan actual según el API: ${s.planCreditLimit || "?"} cr.`,
    "",
  ].join("\n");
  appendFileSync(MD_PATH, header + entry);
}

function logError(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.error(line);
  try {
    appendFileSync(ERROR_LOG_PATH, `${line}\n`);
  } catch {
    // Sin disco no hay más que hacer: ya salió por stderr.
  }
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(here, { recursive: true });
  const credential = loadCredential();
  if (!credential.ok) {
    logError("CLOUDINARY_URL falta o no tiene la forma cloudinary://<api_key>:<api_secret>@<cloud_name> en scripts/cloudinary-monitor/.env");
    process.exitCode = 2;
    return;
  }

  let usage;
  try {
    usage = await fetchUsage(credential);
  } catch (error) {
    const message = error instanceof MonitorError
      ? error.message
      : credential.redact(error?.message ?? String(error));
    const retry = error?.retryAfter ? ` (reintentar en ${credential.redact(error.retryAfter)} s)` : "";
    logError(`Cloudinary Admin API: ${credential.redact(message)}${retry}`);
    process.exitCode = 1;
    return;
  }

  let snapshot;
  try {
    snapshot = buildSnapshot(usage);
    appendCsv(snapshot);
    appendMarkdown(snapshot);
  } catch (error) {
    logError(`no se pudo registrar la corrida: ${credential.redact(error?.message ?? String(error))}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `${snapshot.date} · ${snapshot.totalCredits} cr (${snapshot.pctOfFree} % de ${snapshot.freeTierCredits}) · día ${snapshot.dayOfCycle}/${snapshot.cycleDays} · ${snapshot.flag}`,
  );
}

await main();
