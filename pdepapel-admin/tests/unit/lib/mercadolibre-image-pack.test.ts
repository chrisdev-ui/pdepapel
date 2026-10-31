import { describe, expect, it } from "vitest";

import {
  MERCADOLIBRE_IMAGE_PACK_MAX_PICTURES,
  buildImagePack,
  imagePackCost,
  parseCloudinaryAsset,
} from "@/lib/mercadolibre/image-pack";

const photo = (id: string, extra: Partial<{ isMain: boolean; brokenAt: Date | null }> = {}) => ({
  url: `https://res.cloudinary.com/demo/image/upload/v1791827915/${id}.jpg`,
  ...extra,
});

describe("paquete de fotos de Mercado Libre", () => {
  it("lee la foto original aunque la URL ya traiga transformaciones o carpetas", () => {
    expect(parseCloudinaryAsset("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v12/carpeta/foto.png")).toEqual({
      cloud: "demo",
      version: "v12",
      publicId: "carpeta/foto.png",
    });
    expect(parseCloudinaryAsset("https://res.cloudinary.com/demo/image/upload/foto.png")).toBeNull();
    expect(parseCloudinaryAsset("https://otro.cdn.com/v12/foto.png")).toBeNull();
  });

  it("portada con fondo quitado y blanco 1200 con margen, luego la principal tal cual y las demás, todo en JPG", () => {
    const pack = buildImagePack([photo("b"), photo("a", { isMain: true }), photo("c")]);
    expect(pack.map((picture) => [picture.position, picture.kind, picture.url])).toEqual([
      [1, "portada", "https://res.cloudinary.com/demo/image/upload/e_background_removal/e_trim/c_pad,w_1080,h_1080,b_white/c_lpad,w_1200,h_1200,b_white/f_jpg,q_auto:good/v1791827915/a.jpg"],
      [2, "foto-principal", "https://res.cloudinary.com/demo/image/upload/c_limit,w_1200,h_1200/f_jpg,q_auto:good/v1791827915/a.jpg"],
      [3, "foto", "https://res.cloudinary.com/demo/image/upload/c_limit,w_1200,h_1200/f_jpg,q_auto:good/v1791827915/b.jpg"],
      [4, "foto", "https://res.cloudinary.com/demo/image/upload/c_limit,w_1200,h_1200/f_jpg,q_auto:good/v1791827915/c.jpg"],
    ]);
    expect(pack.every((picture) => picture.url.includes("f_jpg"))).toBe(true);
    // El margen: el segundo relleno no agranda (c_lpad), si no el producto toca el borde.
    expect(pack[0].transformation).toMatch(/c_pad,w_1080,h_1080,b_white\/c_lpad,w_1200,h_1200/);
  });

  it("es determinista: las mismas fotos dan las mismas URL (Cloudinary no vuelve a cobrar)", () => {
    const images = [photo("a", { isMain: true }), photo("b")];
    expect(buildImagePack(images)).toEqual(buildImagePack(images));
  });

  it("no rellena: sin rotas, sin repetidas, sin fotos fuera de Cloudinary y con tope", () => {
    const pack = buildImagePack([
      photo("a", { isMain: true }),
      photo("a"),
      photo("rota", { brokenAt: new Date() }),
      { url: "https://otro.cdn.com/foto.jpg" },
    ]);
    expect(pack.map((picture) => picture.kind)).toEqual(["portada", "foto-principal"]);
    const many = buildImagePack(Array.from({ length: 12 }, (_, index) => photo(`f${index}`, { isMain: index === 0 })));
    expect(many).toHaveLength(MERCADOLIBRE_IMAGE_PACK_MAX_PICTURES);
  });

  it("sin fotos utilizables no hay paquete; el costo cuenta 76 por portada y 1 por foto", () => {
    expect(buildImagePack([])).toEqual([]);
    expect(imagePackCost(buildImagePack([photo("a", { isMain: true }), photo("b")]))).toBe(76 + 1 + 1);
  });
});
