import { describe, expect, it } from "vitest";

import { mergeAdoptedVariants, variantAttributeKey } from "@/lib/product-group-variants";

const v = (id: string | null, size: string | null, color: string | null, design: string | null = null) => ({
  id,
  size: size ? { id: size } : null,
  color: color ? { id: color } : null,
  design: design ? { id: design } : null,
});

/**
 * Traer al grupo (por lista o por escaneo) no repite una variante: ni por id
 * ni por combinación tamaño|color|diseño, ni dentro del mismo lote.
 */
describe("mergeAdoptedVariants", () => {
  it("keys a variant by its attribute combination, empties included", () => {
    expect(variantAttributeKey(v("a", "s", null))).toBe("s|nocolor|nodesign");
    expect(variantAttributeKey(v(null, null, null))).toBe("nosize|nocolor|nodesign");
  });

  it("skips a product already in the group, a repeated combination and duplicates within the batch", () => {
    const current = [v("p1", "s", "rosa"), v(null, "m", "azul")];
    const incoming = [
      v("p1", "l", "verde"), // ya está, por id
      v("p2", "s", "rosa"), // repite la combinación de p1
      v("p3", "m", "azul"), // repite la combinación de la fila nueva
      v("p4", "l", "lila"), // entra
      v("p5", "l", "lila"), // repite a p4 dentro del lote
      v("p6", "xl", "lila"), // entra
    ];
    const { toAdd, skipped } = mergeAdoptedVariants(current, incoming);
    expect(toAdd.map((x) => x.id)).toEqual(["p4", "p6"]);
    expect(skipped.map((x) => x.id)).toEqual(["p1", "p2", "p3", "p5"]);
  });

  it("adds everything when nothing collides", () => {
    const { toAdd, skipped } = mergeAdoptedVariants([], [v("p1", "s", "rosa"), v("p2", "m", "rosa")]);
    expect(toAdd).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });
});
