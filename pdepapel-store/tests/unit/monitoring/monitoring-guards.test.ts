import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MONITORING_PATHS, STALE_TITLE, assessCheckout, inspectCheckout } from "@/scripts/monitoring/lib/checkout-guard.mjs";
import { loadLocalEnv } from "@/scripts/monitoring/lib/common.mjs";
import { VERCEL } from "@/scripts/monitoring/lib/context.mjs";
import { shouldNotifyWeekly } from "@/scripts/monitoring/lib/notify.mjs";

const MONITORING = path.resolve(__dirname, "../../../scripts/monitoring");
const read = (file: string) => fs.readFileSync(path.join(MONITORING, file), "utf8");

describe("monitoreo: la copia principal tiene que estar al día", () => {
  it("le faltan commits del monitoreo o tiene cambios locales → desactualizada", () => {
    expect(assessCheckout({ behind: 2, dirty: [], fetchError: null })).toMatchObject({ stale: true });
    expect(assessCheckout({ behind: 0, dirty: [".claude/commands/monitoreo-semanal.md"], fetchError: null }).reasons[0]).toContain("monitoreo-semanal.md");
    expect(assessCheckout({ behind: 0, dirty: [], fetchError: null })).toEqual({ stale: false, reasons: [], note: null });
  });

  it("sin red no la da por desactualizada, pero lo dice", () => {
    const status = assessCheckout({ behind: 0, dirty: [], fetchError: "error de git fetch" });
    expect(status.stale).toBe(false);
    expect(status.note).toContain("no se pudo consultar origin");
  });

  it("compara solo los archivos del monitoreo, desde la raíz del repo", () => {
    const calls: string[][] = [];
    const git = (args: string[]) => {
      calls.push(args);
      if (args[0] === "rev-parse") return "/repo\n";
      if (args.includes("rev-list")) return "3\n";
      if (args.includes("status")) return " M .claude/commands/monitoreo-semanal.md\n?? pdepapel-store/scripts/monitoring/nuevo.mjs\n";
      return "";
    };
    const status = inspectCheckout(git);
    expect(status.stale).toBe(true);
    expect(status.reasons.join(" ")).toContain("3 commit");
    expect(status.reasons.join(" ")).toContain(".claude/commands/monitoreo-semanal.md, pdepapel-store/scripts/monitoring/nuevo.mjs");
    const revList = calls.find((args) => args.includes("rev-list"))!;
    expect(revList.slice(0, 2)).toEqual(["-C", "/repo"]);
    expect(revList).toContain("HEAD..origin/main");
    expect(revList.slice(-MONITORING_PATHS.length)).toEqual(MONITORING_PATHS);
    expect(MONITORING_PATHS).toContain(".claude/commands/monitoreo-semanal.md");
  });

  it("un fetch fallido sigue comparando con el último origin/main", () => {
    const git = (args: string[]) => {
      if (args[0] === "rev-parse") return "/repo\n";
      if (args.includes("fetch")) throw new Error("offline");
      if (args.includes("rev-list")) return "0\n";
      return "";
    };
    expect(inspectCheckout(git)).toMatchObject({ stale: false, note: expect.stringContaining("error de git fetch") });
  });

  it("los dos wrappers revisan la copia antes de correr; el semanal para con código 3", () => {
    const weekly = read("run-weekly.sh");
    const guard = weekly.indexOf("checkout-guard.mjs --weekly");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(weekly.indexOf("run-daily.sh\""));
    expect(guard).toBeLessThan(weekly.indexOf("-p \"/monitoreo-semanal"));
    expect(weekly).toMatch(/\$\? -eq 3 \]\]; then[\s\S]{0,120}exit 3/);
    const daily = read("run-daily.sh");
    expect(daily.indexOf("checkout-guard.mjs --daily")).toBeLessThan(daily.indexOf("daily-check.mjs"));
    expect(daily).toContain('MONITOREO_CHECKOUT_WARNING="$CHECKOUT_WARNING"');
    expect(read("daily-check.mjs")).toContain("warnings: CHECKOUT_WARNING ? [CHECKOUT_WARNING] : []");
    expect(STALE_TITLE).toBe("Monitoreo: la copia principal está desactualizada (git pull)");
  });
});

describe("monitoreo: el chequeo del carrito espera de verdad", () => {
  it("ningún isVisible lleva timeout (Playwright lo ignora y responde al instante)", () => {
    expect(read("daily-check.mjs")).not.toMatch(/isVisible\(\s*\{[^}]*timeout/);
  });
});

describe("monitoreo: el token de Web Push nunca llega a la revisión de Claude", () => {
  const created: string[] = [];
  afterEach(() => {
    for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.MONITOREO_TEST_A;
    delete process.env.MONITOREO_TEST_B;
  });

  it("loadLocalEnv con claves carga solo esas y no pisa lo que ya está", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "monitoreo-env-"));
    created.push(dir);
    const file = path.join(dir, ".env");
    fs.writeFileSync(file, "MONITOREO_TEST_A=uno\nMONITOREO_TEST_B=dos\n");
    loadLocalEnv(["MONITOREO_TEST_A"], file);
    expect(process.env.MONITOREO_TEST_A).toBe("uno");
    expect(process.env.MONITOREO_TEST_B).toBeUndefined();
    process.env.MONITOREO_TEST_B = "ya";
    loadLocalEnv(null, file);
    expect(process.env.MONITOREO_TEST_B).toBe("ya");
  });

  it("psi-run, que lanza Claude, carga solo PSI_API_KEY", () => {
    expect(read("psi-run.mjs")).toContain('loadLocalEnv(["PSI_API_KEY"])');
    expect(read("weekly-report.mjs")).not.toContain("loadLocalEnv");
  });

  it("run-weekly avisa al final con el .env solo en ese proceso; Claude corre con MONITOREO_HEADLESS=1", () => {
    const weekly = read("run-weekly.sh");
    const claudeLine = weekly.split("\n").find((line) => line.includes('-p "/monitoreo-semanal'))!;
    expect(claudeLine.startsWith("MONITOREO_HEADLESS=1 ")).toBe(true);
    expect(claudeLine).not.toContain("env-file");
    const finalCompile = weekly.split("\n").filter((line) => line.includes("weekly-report.mjs") && line.trimStart().startsWith('"$NODE"'));
    expect(finalCompile).toHaveLength(1);
    expect(finalCompile[0]).toContain('--env-file-if-exists="$SCRIPT_DIR/.env"');
    expect(finalCompile[0]).toContain("--notify");
    expect(weekly.indexOf(finalCompile[0])).toBeGreaterThan(weekly.indexOf("wait $CLAUDE_PID"));
    expect(weekly).not.toMatch(/^export MONITOREO_PUSH_TOKEN/m);
  });

  // Sin lanzar el compilador como proceso: tres arranques bajo cobertura pasaban de 30 s en CI (2026-11-03).
  it("el compilador solo avisa con --notify y nunca dentro de la revisión headless", () => {
    expect(shouldNotifyWeekly([], {})).toBe(false);
    expect(shouldNotifyWeekly(["--notify"], { MONITOREO_HEADLESS: "1" })).toBe(false);
    expect(shouldNotifyWeekly(["--notify"], {})).toBe(true);
    const report = read("weekly-report.mjs");
    expect(report).toContain("const NOTIFY = shouldNotifyWeekly(args);");
    expect(report).toMatch(/if \(NOTIFY\) \{[\s\S]{0,200}notifyAll\(/);
  });

  it("el comando semanal no le pide a Claude que avise", () => {
    const command = fs.readFileSync(path.resolve(__dirname, "../../../../.claude/commands/monitoreo-semanal.md"), "utf8");
    expect(command).toContain("Don't pass `--notify`");
  });
});

describe("monitoreo: Vercel con ids fijos y solo herramientas de lectura", () => {
  it("las herramientas permitidas en run-weekly son exactamente las del contexto", () => {
    const allowed = Array.from(read("run-weekly.sh").matchAll(/"mcp__plugin_vercel_vercel__([a-z_]+)"/g), (m) => m[1]);
    expect(allowed.sort()).toEqual([...VERCEL.tools].sort());
    expect(allowed).not.toContain("list_teams");
    expect(VERCEL.tools.every((tool: string) => /^(list|get)_/.test(tool))).toBe(true);
  });

  it("los ids coinciden con el formato de Vercel y el contexto los entrega", () => {
    expect(VERCEL.teamId).toMatch(/^team_[A-Za-z0-9]+$/);
    expect(VERCEL.projects.store.projectId).toMatch(/^prj_[A-Za-z0-9]+$/);
    expect(VERCEL.projects.admin.projectId).toMatch(/^prj_[A-Za-z0-9]+$/);
    expect(read("weekly-context.mjs")).toContain("vercel: VERCEL");
  });
});
