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
  const urlsOf = (images: { url: string }[]) => images.map((i) => i.url);

  it("hands each variant only the group photos scoped to its colour, design or combo", () => {
    expect(urlsOf(resolveVariantImages({ groupImages, imageMapping, colorId: "color-rosa", designId: "design-kawaii" }))).toEqual([
      groupImages[0].url,
      groupImages[1].url,
      groupImages[3].url,
      groupImages[4].url,
    ]);
    expect(urlsOf(resolveVariantImages({ groupImages, imageMapping, colorId: "color-lila", designId: "design-otro" }))).toEqual([
      groupImages[0].url,
      groupImages[2].url,
    ]);
  });

  it("keeps own photos first and appends the group photos that apply", () => {
    const result = resolveVariantImages({
      variantImages: ["https://res.cloudinary.com/x/own.jpg"],
      groupImages,
      imageMapping,
      colorId: "color-lila",
      designId: "design-otro",
    });
    expect(result).toEqual([
      { url: "https://res.cloudinary.com/x/own.jpg", isMain: true, fromGroup: false },
      { url: groupImages[0].url, isMain: false, fromGroup: true },
      { url: groupImages[2].url, isMain: false, fromGroup: true },
    ]);
  });

  it("does not repeat a group photo the variant already has as its own", () => {
    const result = resolveVariantImages({ variantImages: [groupImages[0].url], groupImages, imageMapping, colorId: "x", designId: "y" });
    expect(result).toEqual([{ url: groupImages[0].url, isMain: true, fromGroup: false }]);
  });

  it("uses the stored scope when the mapping has no entry, and treats no scope as all", () => {
    const photos = [
      { url: "a", scope: "COLOR|c1" },
      { url: "b", scope: null },
    ];
    expect(urlsOf(resolveVariantImages({ groupImages: photos, colorId: "c2", designId: "d" }))).toEqual(["b"]);
    expect(urlsOf(resolveVariantImages({ groupImages: photos, colorId: "c1", designId: "d" }))).toEqual(["a", "b"]);
  });
});

describe("the variant cover", () => {
  const own = [
    { url: "v-1.jpg", isMain: false },
    { url: "v-2.jpg", isMain: true },
  ];
  const covers = (images: { isMain: boolean; url: string }[]) => images.filter((i) => i.isMain).map((i) => i.url);

  it("keeps the own cover even when the group brings its own cover", () => {
    expect(covers(resolveVariantImages({ variantImages: own, groupImages, imageMapping, colorId: "x", designId: "y" }))).toEqual(["v-2.jpg"]);
  });

  it("without own photos, takes the first group cover that applies, and only one", () => {
    const photos = [{ url: "a" }, { url: "b", isMain: true }, { url: "c", isMain: true }];
    expect(covers(resolveVariantImages({ groupImages: photos }))).toEqual(["b"]);
  });

  it("keeps the current cover while it stays in the gallery", () => {
    expect(covers(resolveVariantImages({ variantImages: own, groupImages, imageMapping, colorId: "x", designId: "y", currentCoverUrl: groupImages[0].url }))).toEqual([groupImages[0].url]);
  });

  it("falls back to the next photo when the current cover leaves", () => {
    expect(covers(resolveVariantImages({ groupImages: [{ url: "b" }], currentCoverUrl: "gone" }))).toEqual(["b"]);
  });

  it("with own photos and none marked, the first own photo is the cover", () => {
    expect(covers(resolveVariantImages({ variantImages: ["p-1.jpg", "p-2.jpg"], groupImages }))).toEqual(["p-1.jpg"]);
  });
});

describe("imageUrlKey", () => {
  it("ignores order, duplicates and surrounding spaces", () => {
    expect(imageUrlKey(["b", " a", "a", "b "])).toBe(imageUrlKey(["a", "b"]));
    expect(imageUrlKey(["a"])).not.toBe(imageUrlKey(["a", "b"]));
  });
});

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
});
