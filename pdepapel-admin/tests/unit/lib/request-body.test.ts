import { afterEach, describe, expect, it, vi } from "vitest";

import { readJsonBody, readOptionalJsonBody, requireJsonBody, UNREADABLE_BODY_MESSAGE } from "@/lib/request-body";

/**
 * Cuerpos JSON de las rutas: vacío o roto da un 400 en español y deja en el
 * registro el porqué (error, método, content-length, content-type), nunca el
 * contenido. Con cuerpo opcional, vacío es el valor por defecto.
 */
const req = (body?: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("https://admin.test/api/x", { method: "POST", body, headers });

afterEach(() => vi.restoreAllMocks());

describe("cuerpos JSON", () => {
  it("un objeto válido llega tal cual; el literal null también, como con request.json()", async () => {
    expect(await readJsonBody(req('{"a":1}'), "T")).toEqual({ ok: true, body: { a: 1 } });
    expect(await readJsonBody(req("null"), "T")).toEqual({ ok: true, body: null });
    expect(await requireJsonBody(req('{"a":1}'), "T")).toEqual({ a: 1 });
  });

  it("vacío o roto: 400 en español y un aviso sin el contenido", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(requireJsonBody(req(), "T")).rejects.toMatchObject({ statusCode: 400, message: UNREADABLE_BODY_MESSAGE });
    await expect(requireJsonBody(req("   "), "T")).rejects.toMatchObject({ statusCode: 400 });
    await expect(requireJsonBody(req('{"secreto":"no-debe-salir'), "T", "Mensaje propio")).rejects.toMatchObject({ statusCode: 400, message: "Mensaje propio" });
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[0]).toEqual(["[T] cuerpo ilegible", expect.objectContaining({ empty: true, method: "POST" })]);
    expect(warn.mock.calls[2][1]).toMatchObject({ empty: false, contentType: "application/json" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("no-debe-salir");
  });

  it("opcional: vacío es el valor por defecto sin aviso; con texto que no es JSON sigue siendo 400", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await readOptionalJsonBody(req(), "T", {})).toEqual({});
    expect(warn).not.toHaveBeenCalled();
    expect(await readOptionalJsonBody(req('{"terminalId":"T1"}'), "T", {})).toEqual({ terminalId: "T1" });
    await expect(readOptionalJsonBody(req("{"), "T", {})).rejects.toMatchObject({ statusCode: 400 });
  });

  it("el content-type no decide: un JSON sin cabecera se lee igual", async () => {
    expect(await requireJsonBody(req('{"a":1}', {}), "T")).toEqual({ a: 1 });
  });
});
