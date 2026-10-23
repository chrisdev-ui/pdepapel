import { describe, expect, it } from "vitest";

import { keepUnsavedDrafts } from "@/lib/catalog-migration-drafts";

/**
 * Opciones del catálogo: guardar una propuesta, aplicar o analizar fotos
 * vuelve a leer la lista. Antes se borraba todo lo editado sin guardar en las
 * demás propuestas; ahora solo se descarta el borrador de lo que se tocó.
 */
const attribute = (value: string) => ({ name: "Formato", value });
const suggestion = (id: string, value: string, status = "NEEDS_REVIEW") => ({ id, status, payload: { attributes: [attribute(value)] } });

describe("borradores de las opciones del catálogo", () => {
  const server = [suggestion("a", "guardado A"), suggestion("b", "guardado B"), suggestion("c", "guardado C", "APPLIED")];
  const drafts = { a: [attribute("editado A")], b: [attribute("editado B")], c: [attribute("editado C")] };
  const dirty = { a: true, b: true, c: true };

  it("guardar «a» conserva lo editado en «b»", () => {
    const next = keepUnsavedDrafts(server, drafts, dirty, ["a"]);
    expect(next.drafts.a).toEqual([attribute("guardado A")]);
    expect(next.drafts.b).toEqual([attribute("editado B")]);
    expect(next.dirty).toEqual({ b: true });
  });

  it("lo aplicado y lo que ya no está no conservan borrador", () => {
    const next = keepUnsavedDrafts([suggestion("b", "guardado B"), suggestion("c", "guardado C", "APPLIED")], drafts, dirty);
    expect(next.drafts).toEqual({ b: [attribute("editado B")], c: [attribute("guardado C")] });
    expect(next.dirty).toEqual({ b: true });
  });

  it("sin nada editado, todo sale de lo guardado", () => {
    const next = keepUnsavedDrafts(server, {}, {});
    expect(next.dirty).toEqual({});
    expect(next.drafts.b).toEqual([attribute("guardado B")]);
  });
});
