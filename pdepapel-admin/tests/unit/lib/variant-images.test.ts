import { describe, expect, it } from "vitest";

import {
  imageUrlKey,
  resolveVariantImages,
  withVariantCover,
} from "@/lib/variant-images";

const groupImages = [
  { url: "https://res.cloudinary.com/x/all.jpg", isMain: true },
  { url: "https://res.cloudinary.com/x/rosa.jpg" },
  { url: "https://res.cloudinary.com/x/lila.jpg" },
  { url: "https://res.cloudinary.com/x/combo.jpg" },
  { url: "https://res.cloudinary.com/x/kawaii.jpg" },
];
const imageMapping = [
  { url: groupImages[0].url, scope: "all" },
  // El formulario guarda el id suelto; las rutas también aceptan los prefijos.
  { url: groupImages[1].url, scope: "color-rosa" },
  { url: groupImages[2].url, scope: "COLOR|color-lila" },
  { url: groupImages[3].url, scope: "COMBO|color-rosa|design-kawaii" },
  { url: groupImages[4].url, scope: "DESIGN|design-kawaii" },
];

describe("resolveVariantImages", () => {
  it("hands each variant only the photos scoped to its colour, design or combo", () => {
    const rosaKawaii = resolveVariantImages({
      groupImages,
      imageMapping,
      colorId: "color-rosa",
      designId: "design-kawaii",
    });
    expect(rosaKawaii.map((i) => i.url)).toEqual([
      groupImages[0].url,
      groupImages[1].url,
      groupImages[3].url,
      groupImages[4].url,
    ]);

    const lilaOtro = resolveVariantImages({
      groupImages,
      imageMapping,
      colorId: "color-lila",
      designId: "design-otro",
    });
    expect(lilaOtro.map((i) => i.url)).toEqual([
      groupImages[0].url,
      groupImages[2].url,
    ]);
  });

  it("lets explicit variant images override the group mapping", () => {
    const explicit = resolveVariantImages({
      variantImages: ["https://res.cloudinary.com/x/own.jpg"],
      groupImages,
      imageMapping,
      colorId: "color-rosa",
      designId: "design-kawaii",
    });
    expect(explicit).toEqual([{ url: "https://res.cloudinary.com/x/own.jpg" }]);
  });

  it("treats unmapped images as shared", () => {
    expect(
      resolveVariantImages({
        groupImages: [{ url: "a" }],
        imageMapping: [],
        colorId: "c",
        designId: "d",
      }),
    ).toEqual([{ url: "a" }]);
  });
});

describe("imageUrlKey", () => {
  it("ignores order, duplicates and surrounding spaces", () => {
    expect(imageUrlKey(["b", " a", "a", "b "])).toBe(imageUrlKey(["a", "b"]));
    expect(imageUrlKey(["a"])).not.toBe(imageUrlKey(["a", "b"]));
  });
});

/**
 * La portada de una variante con fotos propias.
 *
 * Paula entró a una variante solo a cargarle stock y al guardar le cambió la
 * foto de portada. La rama de fotos propias devolvía únicamente la url y se
 * dejaba el `isMain` por el camino, mientras que la rama del grupo sí lo
 * llevaba. Resultado: toda variante con fotos propias —las adoptadas con
 * «Traer existentes», y cualquiera editada aparte— perdía su portada en cada
 * guardado del grupo, por cualquier motivo. Sin portada marcada, cada
 * pantalla elegía una por su cuenta y la que se guardara después pasaba a ser
 * la buena.
 */
describe("la portada de las fotos propias de una variante", () => {
  const propias = [
    { url: "https://res.cloudinary.com/x/v-1.jpg", isMain: false },
    { url: "https://res.cloudinary.com/x/v-2.jpg", isMain: true },
    { url: "https://res.cloudinary.com/x/v-3.jpg", isMain: false },
  ];

  it("conserva cuál es la portada", () => {
    const resultado = resolveVariantImages({ variantImages: propias, groupImages });
    expect(resultado).toEqual(propias);
    expect(resultado.filter((i) => i.isMain)).toHaveLength(1);
    expect(resultado.find((i) => i.isMain)?.url).toBe(propias[1].url);
  });

  it("una lista de urls sueltas sigue sin portada: no hay nada que conservar", () => {
    const resultado = resolveVariantImages({
      variantImages: ["https://res.cloudinary.com/x/v-1.jpg"],
      groupImages,
    });
    expect(resultado).toEqual([{ url: "https://res.cloudinary.com/x/v-1.jpg" }]);
  });

  it("no toca la rama del grupo, que ya llevaba la portada", () => {
    const resultado = resolveVariantImages({ groupImages, imageMapping, colorId: null, designId: null });
    expect(resultado.some((i) => i.isMain)).toBe(true);
  });
});

/**
 * La red que faltaba: el formulario del producto suelto exige una y solo una
 * portada, el camino del grupo no exigía ninguna.
 */
describe("withVariantCover", () => {
  it("asciende la primera cuando ninguna está marcada", () => {
    expect(withVariantCover([{ url: "a.jpg" }, { url: "b.jpg" }])).toEqual([
      { url: "a.jpg", isMain: true },
      { url: "b.jpg", isMain: false },
    ]);
  });

  it("respeta la portada que ya venía elegida", () => {
    expect(
      withVariantCover([
        { url: "a.jpg", isMain: false },
        { url: "b.jpg", isMain: true },
      ]),
    ).toEqual([
      { url: "a.jpg", isMain: false },
      { url: "b.jpg", isMain: true },
    ]);
  });

  it("sin fotos no inventa ninguna", () => {
    expect(withVariantCover([])).toEqual([]);
  });

  it("deja exactamente una portada, nunca dos", () => {
    const r = withVariantCover([{ url: "a.jpg" }, { url: "b.jpg" }, { url: "c.jpg" }]);
    expect(r.filter((i) => i.isMain)).toHaveLength(1);
  });

  /** Lo que de verdad importa: lo que sale de resolver ya va con portada. */
  it("encadenado con el resolvedor, una variante nunca se queda sin portada", () => {
    const sinMarcar = resolveVariantImages({
      variantImages: [{ url: "p-1.jpg" }, { url: "p-2.jpg" }],
      groupImages,
    });
    expect(sinMarcar.some((i) => i.isMain)).toBe(false);
    expect(withVariantCover(sinMarcar).filter((i) => i.isMain)).toHaveLength(1);
  });
});
