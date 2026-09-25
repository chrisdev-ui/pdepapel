import { describe, expect, it } from "vitest";

import { withSanitizedDescription } from "@/lib/product-description";
import { sanitizeRichTextHtml } from "@/lib/rich-text";

const dirty =
  '<h1 style="color:#DB2777;font-size:99px">Título</h1><p>Hola <strong>mundo</strong> <a href="javascript:alert(1)">x</a></p><img src=x onerror="alert(1)">';

describe("withSanitizedDescription", () => {
  it("sanea con la misma función que antes usaba el navegador", () => {
    const product = withSanitizedDescription({ id: "p1", name: "Agenda", description: dirty });
    expect(product.description).toBe(sanitizeRichTextHtml(dirty));
    expect(product.description).not.toContain("<img");
    expect(product.description).not.toContain("javascript:");
    expect(product.description).toContain("<strong>mundo</strong>");
  });

  it("no toca nada más del producto y no muta el original", () => {
    const original = { id: "p1", name: "Agenda", price: "25000", description: dirty, images: [{ id: "i1" }] };
    const product = withSanitizedDescription(original);
    expect(product).toMatchObject({ id: "p1", name: "Agenda", price: "25000", images: [{ id: "i1" }] });
    expect(original.description).toBe(dirty);
    expect(product).not.toBe(original);
  });

  it("una descripción ausente queda como cadena vacía, que es lo que la ficha entiende como «sin descripción»", () => {
    expect(withSanitizedDescription({ description: null }).description).toBe("");
    expect(withSanitizedDescription({ description: undefined }).description).toBe("");
  });
});
