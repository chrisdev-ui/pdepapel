import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { MONITORING_DIR, mainCheckoutRoot, outputDir, readJson } from "./common.mjs";

const overlaps = (event, [from, to]) => event.start <= to && (event.end ?? "9999-12-31") >= from;

export function knownEvents(window) {
  const tracked = readJson(path.join(MONITORING_DIR, "known-events.json"), { events: [] }).events ?? [];
  const local = readJson(path.join(outputDir(), "eventos.json"), { events: [] }).events ?? [];
  return [...tracked, ...local].filter((event) => event?.start && overlaps(event, window));
}

/** Production deploys = commits that reached origin/main in the window (both apps deploy from main). */
export function deploysInWindow([from, to]) {
  const cwd = mainCheckoutRoot();
  try {
    execFileSync("git", ["fetch", "--quiet", "origin", "main"], { cwd, stdio: "ignore", timeout: 30_000 });
  } catch {
    // Offline: fall back to the last fetched origin/main.
  }
  try {
    const log = execFileSync(
      "git",
      ["log", "origin/main", `--since=${from}T00:00:00-05:00`, `--until=${to}T23:59:59-05:00`, "--first-parent", "--date=short", "--format=%h%x09%ad%x09%s"],
      { cwd, encoding: "utf8", timeout: 30_000 },
    );
    return log
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, date, subject] = line.split("\t");
        return { sha, date, subject };
      });
  } catch (error) {
    return { error: error instanceof Error ? error.message.split("\n")[0] : "git log falló" };
  }
}

export function dailyResults([from, to]) {
  const dir = path.join(outputDir(), "diario");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 10))
    .filter((date) => date >= from && date <= to)
    .sort()
    .map((date) => readJson(path.join(dir, `${date}.json`)))
    .filter(Boolean);
}
