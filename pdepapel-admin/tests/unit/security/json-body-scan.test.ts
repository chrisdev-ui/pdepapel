import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia de regresión de los cuerpos JSON en `app/api`.
 *
 * 1. `.json().catch(...)` escondía un cuerpo vacío o roto detrás de un valor
 *    por defecto: capsule-settings respondía 200 y borraba los mínimos, y la
 *    portada de una categoría arrancaba una generación paga. Se lee con
 *    `requireJsonBody` (400 en español y el porqué en el registro) o, si el
 *    cliente manda el POST sin cuerpo, `readOptionalJsonBody`.
 * 2. `await req.json()` sin más responde 500 con un cuerpo roto. El conteo
 *    solo baja: una ruta nueva usa `requireJsonBody`.
 */
const API = path.resolve(__dirname, "../../..", "app", "api");

/** Excepciones a la regla 1, con su motivo. */
const ALLOWED_JSON_CATCH: Record<string, string> = {
  "webhook/envioclick/route.ts": "webhook externo con su propio contrato de error (InvalidWebhookPayloadError), no un valor por defecto silencioso",
};

/** Llamadas `await req.json()` / `await request.json()` sin manejo al 2026-10-24. Solo puede bajar. */
const BARE_JSON_MAX = 115;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

const files = routeFiles(API).map((file) => ({ rel: path.relative(API, file).split(path.sep).join("/"), text: readFileSync(file, "utf8") }));

describe("cuerpos JSON en las rutas", () => {
  it("ninguna ruta esconde un cuerpo ilegible con .json().catch(...)", () => {
    const offenders = files.filter(({ rel, text }) => /\.json\(\)\s*\.catch\(/.test(text) && !(rel in ALLOWED_JSON_CATCH)).map(({ rel }) => rel);
    expect(offenders, "usa requireJsonBody (o readOptionalJsonBody si el cliente manda el POST sin cuerpo) de @/lib/request-body").toEqual([]);
  });

  it("cada excepción sigue existiendo y sigue necesitando serlo", () => {
    for (const rel of Object.keys(ALLOWED_JSON_CATCH)) {
      const file = files.find((item) => item.rel === rel);
      expect(file, rel).toBeDefined();
      expect(/\.json\(\)\s*\.catch\(/.test(file!.text), rel).toBe(true);
    }
  });

  it(`las llamadas a .json() sin manejo no suben de ${BARE_JSON_MAX}`, () => {
    const count = files.reduce((total, { text }) => total + (text.match(/await (req|request)\.json\(\)/g)?.length ?? 0), 0);
    expect(count, "una ruta nueva lee el cuerpo con requireJsonBody de @/lib/request-body").toBeLessThanOrEqual(BARE_JSON_MAX);
  });
});
