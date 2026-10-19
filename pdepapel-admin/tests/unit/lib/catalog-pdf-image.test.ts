import { describe, expect, it } from "vitest";

import {
  CATALOG_PDF_IMAGE_HEIGHT,
  CATALOG_PDF_IMAGE_TRANSFORMATION,
  CATALOG_PDF_IMAGE_WIDTH,
  CATALOG_PDF_PHOTO_BOX,
  catalogPdfImageUrl,
} from "@/lib/catalog-pdf-image";

describe("foto del catálogo PDF", () => {
  it("la transformación es la autorizada (400×344): si la tarjeta cambia, esta prueba avisa", () => {
    expect(CATALOG_PDF_IMAGE_TRANSFORMATION).toBe("c_fill,w_400,h_344,q_auto");
  });

  it("la copia tiene la proporción de la caja de la foto (≈233 × 200 pt), así el recorte es el mismo de antes", () => {
    expect(CATALOG_PDF_PHOTO_BOX.width).toBeCloseTo(232.93, 1);
    expect(CATALOG_PDF_PHOTO_BOX.height).toBe(200);
    const box = CATALOG_PDF_PHOTO_BOX.width / CATALOG_PDF_PHOTO_BOX.height;
    const image = CATALOG_PDF_IMAGE_WIDTH / CATALOG_PDF_IMAGE_HEIGHT;
    expect(Math.abs(image - box) / box).toBeLessThan(0.01);
  });

  it("arma la URL 400×344 en JPEG para fotos de Cloudinary", () => {
    expect(catalogPdfImageUrl("https://res.cloudinary.com/demo/image/upload/v1700000000/carpeta/foto.jpg")).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_400,h_344,q_auto/v1700000000/carpeta/foto.jpg",
    );
  });

  it("PNG y WebP pasan a JPEG; una URL ya transformada se reemplaza; sin extensión se añade .jpg", () => {
    expect(catalogPdfImageUrl("https://res.cloudinary.com/demo/image/upload/v1/foto.png")).toBe("https://res.cloudinary.com/demo/image/upload/c_fill,w_400,h_344,q_auto/v1/foto.jpg");
    expect(catalogPdfImageUrl("https://res.cloudinary.com/demo/image/upload/v1/foto.webp")).toBe("https://res.cloudinary.com/demo/image/upload/c_fill,w_400,h_344,q_auto/v1/foto.jpg");
    expect(catalogPdfImageUrl("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_640/v1/foto.jpg?x=1#y")).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_400,h_344,q_auto/v1/foto.jpg",
    );
    expect(catalogPdfImageUrl("https://res.cloudinary.com/demo/image/upload/v1/sin-extension")).toBe("https://res.cloudinary.com/demo/image/upload/c_fill,w_400,h_344,q_auto/v1/sin-extension.jpg");
    expect(catalogPdfImageUrl("https://res.cloudinary.com/demo/image/upload/v1/carpeta.v2/foto")).toBe("https://res.cloudinary.com/demo/image/upload/c_fill,w_400,h_344,q_auto/v1/carpeta.v2/foto.jpg");
  });

  it("las URL que no son de Cloudinary quedan igual", () => {
    for (const url of ["https://placehold.co/400", "http://localhost:3001/images/transparent-background.png", "data:image/png;base64,AAAA"]) {
      expect(catalogPdfImageUrl(url)).toBe(url);
    }
  });
});
