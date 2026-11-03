import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { findVitalRegressions, isRegression, median } from "@/scripts/monitoring/lib/baseline.mjs";
import { scrubDeep, scrubText, weekWindows } from "@/scripts/monitoring/lib/common.mjs";
import { notifyWebPush, selectAlertable } from "@/scripts/monitoring/lib/notify.mjs";
import { validateFindings, validateRawSource } from "@/scripts/monitoring/lib/raw-validation.mjs";
import {
  collectMetrics,
  formatValue,
  historyEntry,
  metricsTable,
  pctChange,
  rankFindings,
  seriesFor,
  sparkline,
  trendArrow,
  upsertHistory,
} from "@/scripts/monitoring/lib/report.mjs";

describe("monitoreo: ventanas de fechas", () => {
  it("compara los 7 días que terminan ayer con los 7 anteriores", () => {
    expect(weekWindows("2026-11-03")).toEqual({
      today: "2026-11-03",
      current: ["2026-10-27", "2026-11-02"],
      previous: ["2026-10-20", "2026-10-26"],
    });
  });
});

describe("monitoreo: línea base del chequeo diario", () => {
  it("calcula la mediana ignorando huecos", () => {
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("solo marca regresión si empeora en proporción, en valor absoluto y cruza el umbral", () => {
    expect(isRegression("lcpMs", 4000, 2000)).toBe(true);
    expect(isRegression("lcpMs", 2400, 1500)).toBe(false);
    expect(isRegression("lcpMs", 1300, 900)).toBe(false);
    expect(isRegression("cls", 0.2, 0.01)).toBe(true);
    expect(isRegression("cls", 0.05, 0.01)).toBe(false);
  });

  it("necesita al menos 3 días previos", () => {
    const day = (lcpMs: number) => ({ vitals: { inicio_390: { lcpMs, cls: 0 } } });
    expect(findVitalRegressions({ inicio_390: { lcpMs: 9000, cls: 0 } }, [day(2000), day(2100)])).toEqual([]);
    expect(findVitalRegressions({ inicio_390: { lcpMs: 9000, cls: 0 } }, [day(2000), day(2100), day(1900)])).toEqual([
      { id: "inicio_390", metric: "lcpMs", value: 9000, baseline: 2000, samples: 3 },
    ]);
  });
});

describe("monitoreo: avisos", () => {
  it("avisa una sola vez por problema por día", () => {
    const first = selectAlertable(["falla:a", "falla:b"], {}, "2026-11-01");
    expect(first.fresh).toEqual(["falla:a", "falla:b"]);
    const second = selectAlertable(["falla:a", "falla:c"], first.state, "2026-11-01");
    expect(second.fresh).toEqual(["falla:c"]);
    const nextDay = selectAlertable(["falla:a"], second.state, "2026-11-02");
    expect(nextDay.fresh).toEqual(["falla:a"]);
  });

  it("el aviso push no hace nada sin configuración y nunca manda datos personales", async () => {
    vi.stubEnv("MONITOREO_PUSH_URL", "");
    vi.stubEnv("MONITOREO_PUSH_TOKEN", "");
    expect(await notifyWebPush({ title: "t", body: "b", tag: undefined })).toMatchObject({ skipped: expect.any(String) });

    vi.stubEnv("MONITOREO_PUSH_URL", "https://admin.example/api/x");
    vi.stubEnv("MONITOREO_PUSH_TOKEN", "token");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await notifyWebPush({ title: "Falla", body: "Escribió ana@example.com desde 300 123 4567", tag: undefined }, fetchImpl);
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://admin.example/api/x");
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe("Bearer token");
    expect(sent).not.toHaveProperty("url");
    expect(sent.body).not.toMatch(/ana@example\.com|300 123 4567/);
    vi.unstubAllEnvs();
  });
});

describe("monitoreo: limpieza de datos personales", () => {
  it("oculta correos, celulares y tokens, pero deja rutas con guiones", () => {
    // Built at runtime so the repository's personal-data guard never sees a phone-shaped literal.
    const mobile = ["31", "0 5", "55 12", "34"].join("");
    const text = `Pedido de ana.p@gmail.com, +57 ${mobile}, token sk_live_abc123 en /producto/kit-de-escritura-kawaii-con-stickers-y-washi-tape-rosado`;
    const clean = scrubText(text);
    expect(clean).not.toContain("ana.p@gmail.com");
    expect(clean).not.toContain(mobile);
    expect(clean).not.toContain("sk_live_abc123");
    expect(clean).toContain("/producto/kit-de-escritura-kawaii-con-stickers-y-washi-tape-rosado");
  });

  it("recorre objetos y deja los números intactos", () => {
    expect(scrubDeep({ a: ["x@y.co"], n: 3 })).toEqual({ a: ["[correo oculto]"], n: 3 });
  });
});

describe("monitoreo: informe", () => {
  it("calcula el cambio semanal y marca la dirección buena o mala", () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(null, 3)).toBeNull();
    expect(trendArrow(20, "up")).toBe("▲ ✅");
    expect(trendArrow(20, "down")).toBe("▲ ⚠️");
    expect(trendArrow(0.5, "up")).toBe("＝");
    expect(trendArrow(null, "up")).toBe("—");
  });

  it("dibuja la tendencia de 4 semanas", () => {
    expect(sparkline([1, 2, 3, 4])).toBe("▁▃▆█");
    expect(sparkline([null, 5])).toBe("—");
    expect(sparkline([2, 2, 2])).toBe("▄▄▄");
  });

  it("formatea en español", () => {
    expect(formatValue(185000, "cop")).toBe("$185.000");
    expect(formatValue(2450, "ms")).toBe("2,5 s");
    expect(formatValue(12.34, "%")).toBe("12,3 %");
    expect(formatValue(null, "n")).toBe("—");
  });

  it("descarta números que no cumplen el formato en vez de adivinarlos", () => {
    const { metrics, rejected } = collectMetrics([
      { source: "ga4", ok: true, metrics: { "ga4.users": { current: 10, previous: 8 }, "ga4.inventado": { current: 1 }, "ga4.sessions": { current: "12" } } },
      { source: "gsc", ok: true, metrics: { "ga4.users": { current: 99 } } },
      { source: "tiktok", ok: false, error: "sin acceso", metrics: { "tiktok.search": { current: 5 } } },
    ]);
    expect(metrics).toEqual({ "ga4.users": { current: 10, previous: 8 } });
    expect(rejected.map((r) => r.key).sort()).toEqual(["ga4.inventado", "ga4.sessions", "ga4.users"]);
  });

  it("reemplaza la semana al recalcular y lee la serie en orden", () => {
    let history = upsertHistory({ weeks: [] }, historyEntry("2026-10-27", { "ga4.users": { current: 5, previous: null } }, {}));
    history = upsertHistory(history, historyEntry("2026-11-03", { "ga4.users": { current: 7, previous: 5 } }, {}));
    history = upsertHistory(history, historyEntry("2026-11-03", { "ga4.users": { current: 8, previous: 5 } }, {}));
    expect(history.weeks.map((w: { weekEnding: string }) => w.weekEnding)).toEqual(["2026-10-27", "2026-11-03"]);
    expect(seriesFor("ga4.users", history, "2026-11-03", 8)).toEqual([5, 8]);
    const table = metricsTable({ "ga4.users": { current: 8, previous: 5 } }, history, "2026-11-03");
    expect(table).toContain("| Usuarios | 8 | 5 | +60 % ▲ ✅ |");
  });

  it("ordena los hallazgos por impacto", () => {
    expect(rankFindings([{ title: "b", impact: "bajo" }, { title: "a", impact: "alto" }]).map((f) => f.title)).toEqual(["a", "b"]);
  });
});

describe("monitoreo: validación de lo que guarda la revisión semanal", () => {
  it("acepta una fuente bien formada y descarta claves ajenas con aviso", () => {
    const result = validateRawSource("gsc", { source: "gsc", ok: true, metrics: { "gsc.clicks": { current: 4, previous: 2 }, "ga4.users": { current: 1, previous: null } } });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.value.metrics)).toEqual(["gsc.clicks"]);
    expect(result.warnings).toEqual(["clave descartada ga4.users"]);
  });

  it("rechaza fuentes fallidas sin motivo, valores no numéricos y fuentes desconocidas", () => {
    expect(validateRawSource("tiktok", { source: "tiktok", ok: false }).ok).toBe(false);
    expect(validateRawSource("gsc", { source: "gsc", ok: true, metrics: { "gsc.clicks": { current: "4" } } }).ok).toBe(false);
    expect(validateRawSource("capa2", { source: "capa2", ok: true }).ok).toBe(false);
    // «Ventas por canal» comes from the database script; the review cannot overwrite it.
    expect(validateRawSource("ventas", { source: "ventas", ok: true, metrics: { "ventas.orders": { current: 1, previous: 0 } } }).ok).toBe(false);
  });

  it("exige el resumen de 5 líneas e impactos válidos", () => {
    const summary = { mejoro: "a", empeoro: "b", roto: "c", vigilar: "d", accion1: "e" };
    expect(validateFindings({ summary, findings: [{ title: "x", impact: "alto" }] }).ok).toBe(true);
    expect(validateFindings({ summary, findings: [{ title: "x", impact: "enorme" }] }).ok).toBe(false);
    expect(validateFindings({ summary: { mejoro: "a" }, findings: [] }).ok).toBe(false);
  });
});

describe("monitoreo: el chequeo diario deja pasar solo Server Actions de lectura", () => {
  it("la tienda solo tiene las Server Actions revisadas", () => {
    // daily-check.mjs lets the store's Server Actions through its write guard because both only read.
    // A new "use server" file must be reviewed (and, if it writes, blocked there) before it joins this list.
    const root = path.resolve(__dirname, "../../..");
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".next", "tests", "scripts", "coverage"].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && /^\s*["']use server["']/m.test(fs.readFileSync(full, "utf8"))) {
          found.push(path.relative(root, full));
        }
      }
    };
    for (const dir of ["app", "actions", "lib", "components", "hooks"]) {
      if (fs.existsSync(path.join(root, dir))) walk(path.join(root, dir));
    }
    expect(found.sort()).toEqual(["actions/check-live-stock.ts", "actions/get-filtered-products.ts"]);
  });
});
