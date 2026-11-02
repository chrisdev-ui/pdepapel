import { execFile } from "node:child_process";
import path from "node:path";

import { bogotaDate, outputDir, readJson, scrubText, writeJson } from "./common.mjs";

const MAX_BODY = 230;

function clip(text, max) {
  const clean = scrubText(String(text)).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Text goes in as argv, never interpolated into the AppleScript source. */
export function notifyMac(title, body) {
  if (process.platform !== "darwin" || process.env.MONITOREO_NO_MAC_NOTIFY === "1") {
    return Promise.resolve({ channel: "macos", skipped: "desactivado" });
  }
  return new Promise((resolve) => {
    execFile(
      "osascript",
      [
        "-e",
        "on run argv",
        "-e",
        'display notification (item 2 of argv) with title (item 1 of argv) sound name "Glass"',
        "-e",
        "end run",
        clip(title, 80),
        clip(body, MAX_BODY),
      ],
      (error) => resolve({ channel: "macos", ok: !error, error: error ? error.message : null }),
    );
  });
}

const DEFAULT_PUSH_URL = "https://admin.papeleriapdepapel.com/api/f23ee5bc-1f6f-4c10-9872-9e6217cc17fd/monitoring/alert";

/**
 * The owner's panel Web Push channel (admin route monitoring/alert, which
 * calls sendWebPushToStore). MONITOREO_PUSH_TOKEN in scripts/monitoring/.env
 * must equal the admin's MONITOREO_PUSH_SECRET; without it this leg is a no-op.
 * The admin fixes the notification link itself, so `url` is not sent.
 */
export async function notifyWebPush({ title, body, tag }, fetchImpl = fetch) {
  const endpoint = process.env.MONITOREO_PUSH_URL || DEFAULT_PUSH_URL;
  const token = process.env.MONITOREO_PUSH_TOKEN;
  if (!token) return { channel: "webpush", skipped: "no configurado (MONITOREO_PUSH_TOKEN)" };
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: clip(title, 80), body: clip(body, MAX_BODY), tag }),
      signal: AbortSignal.timeout(10_000),
    });
    return { channel: "webpush", ok: response.ok, status: response.status };
  } catch (error) {
    return { channel: "webpush", ok: false, error: error instanceof Error ? error.name : "error" };
  }
}

export async function notifyAll(message) {
  const results = await Promise.all([notifyMac(message.title, message.body), notifyWebPush(message)]);
  return results;
}

/**
 * At most one alert per issue per day. `state` maps issue key → last alert
 * date (Bogotá). Returns the keys that may alert now and the updated state.
 */
export function selectAlertable(issueKeys, state, today = bogotaDate()) {
  const next = { ...state };
  const fresh = [];
  for (const key of issueKeys) {
    if (next[key] === today) continue;
    next[key] = today;
    fresh.push(key);
  }
  return { fresh, state: next };
}

export function alertStateFile() {
  return path.join(outputDir(), "alertas-estado.json");
}

export function loadAlertState() {
  return readJson(alertStateFile(), {});
}

export function saveAlertState(state) {
  // Old keys are dropped after 30 days so the file stays small.
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const kept = Object.fromEntries(Object.entries(state).filter(([, date]) => date >= cutoff));
  writeJson(alertStateFile(), kept);
}
