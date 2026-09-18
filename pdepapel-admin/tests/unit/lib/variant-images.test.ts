import { describe, expect, it } from "vitest";

import { imageUrlKey, resolveVariantImages } from "@/lib/variant-images";

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
