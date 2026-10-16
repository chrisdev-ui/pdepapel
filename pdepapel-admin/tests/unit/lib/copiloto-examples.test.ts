import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { TOOL_LABELS } from "@/app/(dashboard)/[storeId]/(routes)/copiloto/components/suggestions";
import { COPILOT_EXAMPLE_TOPICS, COPILOT_EXAMPLES, copilotSuggestions } from "@/lib/copiloto/examples";
import { SKILL_TOOL_NAMES } from "@/lib/copiloto/skills";
import { KITS_TEXTS_TOOL } from "@/lib/copiloto/skills/kits-texts";
import { COPILOT_TOOL_NAMES } from "@/lib/copiloto/tools";

const ROOT = path.resolve(__dirname, "../../..");
const ROUTE_NAMES = readdirSync(path.join(ROOT, "app/(dashboard)/[storeId]/(routes)"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const ROUTES = new Set(ROUTE_NAMES);
const REAL_TOOLS = [...COPILOT_TOOL_NAMES, ...SKILL_TOOL_NAMES, "cargarHabilidad"];

describe("ejemplos del copiloto", () => {
  it("cada ejemplo lo responde una herramienta que existe, con su letrero mientras corre", () => {
    for (const example of COPILOT_EXAMPLES) {
      expect(REAL_TOOLS, example.pregunta).toContain(example.herramienta);
      expect(TOOL_LABELS[example.herramienta], example.herramienta).toBeTruthy();
    }
    for (const tool of REAL_TOOLS) expect(TOOL_LABELS[tool], tool).toBeTruthy();
  });

  it("cada herramienta de datos tiene al menos un ejemplo", () => {
    const covered = new Set(COPILOT_EXAMPLES.map((example) => example.herramienta));
    // textosDeKits no se pregunta: el chat la llama sola después de kitsParaRotar.
    for (const tool of [...COPILOT_TOOL_NAMES, ...SKILL_TOOL_NAMES].filter((name) => name !== KITS_TEXTS_TOOL)) expect(covered.has(tool), tool).toBe(true);
  });

  it("las pantallas son rutas del panel y cada tema tiene ejemplos", () => {
    for (const example of COPILOT_EXAMPLES) for (const screen of example.pantallas) expect(screen === "inicio" || ROUTES.has(screen), screen).toBe(true);
    for (const topic of COPILOT_EXAMPLE_TOPICS) expect(COPILOT_EXAMPLES.some((example) => example.tema === topic), topic).toBe(true);
  });

  it("las sugerencias salen de la pantalla (también en subrutas) o, si no hay, las generales; nunca más de 5", () => {
    expect(copilotSuggestions("mercadolibre/publicaciones")).toEqual(["¿Hay alertas en Mercado Libre?"]);
    expect(copilotSuggestions("ventas-rapidas")).toEqual(["¿Cuánto vendí en el punto de venta ayer?"]);
    const general = COPILOT_EXAMPLES.filter((example) => example.general).map((example) => example.pregunta);
    expect(copilotSuggestions(null)).toEqual(general.slice(0, 5));
    expect(copilotSuggestions("tarjetas-regalo")).toEqual(general.slice(0, 5));
    for (const screen of [...ROUTE_NAMES, "inicio"]) expect(copilotSuggestions(screen).length).toBeLessThanOrEqual(5);
  });

  it("no sugiere lo que ninguna herramienta responde", () => {
    const all = [...ROUTE_NAMES, "inicio", null].flatMap((screen) => copilotSuggestions(screen));
    expect(all.some((question) => /debajo del costo/i.test(question))).toBe(false);
  });

  it("el manual y la guía traen cada ejemplo, tal cual", () => {
    const manual = readFileSync(path.join(ROOT, "content/manual/manual.html"), "utf8");
    const guide = readFileSync(path.join(ROOT, "docs/guia-panel-administracion.md"), "utf8");
    for (const example of COPILOT_EXAMPLES) {
      expect(manual, example.pregunta).toContain(example.pregunta);
      expect(guide, example.pregunta).toContain(example.pregunta);
    }
  });
});
