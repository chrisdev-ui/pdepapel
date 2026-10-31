/**
 * Paquete de fotos de Mercado Libre de un producto, hecho solo con sus fotos
 * reales y transformaciones de Cloudinary sobre la URL (no se sube nada ni se
 * toca la galería de la tienda):
 *   1. Portada: la foto principal con el fondo quitado, recortada al producto y
 *      centrada en blanco 1200 × 1200 con 60 px de margen (ocupa el 90 %). El
 *      segundo relleno es `c_lpad`: `c_pad` agranda el cuadro de 1080 hasta
 *      1200 y el producto queda tocando el borde (receta mlp1, descartada).
 *   2. La misma foto principal tal cual, para ver el producto real.
 *   3. El resto de las fotos del producto, en el orden de la galería.
 * Nada generado: sin ángulos, colores ni contenidos nuevos, sin copias para
 * rellenar, sin marcas de agua. Todo sale en JPG.
 *
 * Una URL de Cloudinary con la misma versión y la misma transformación es
 * siempre la misma copia derivada (se cobra una vez). Cambiar la receta cambia
 * las URL: por eso lleva versión.
 */
export const MERCADOLIBRE_IMAGE_PACK_RECIPE = "mlp2";

/** Quitar fondo cuesta 75 transformaciones más la propia, una vez por URL nueva. */
export const BACKGROUND_REMOVAL_TRANSFORMATIONS = 76;

export const MERCADOLIBRE_IMAGE_PACK_MAX_PICTURES = 8;

const COVER_TRANSFORMATION = "e_background_removal/e_trim/c_pad,w_1080,h_1080,b_white/c_lpad,w_1200,h_1200,b_white/f_jpg,q_auto:good";
const PHOTO_TRANSFORMATION = "c_limit,w_1200,h_1200/f_jpg,q_auto:good";

export type ImagePackKind = "portada" | "foto-principal" | "foto";

export interface ImagePackPicture {
  position: number;
  kind: ImagePackKind;
  sourceUrl: string;
  url: string;
  transformation: string;
}

export interface CloudinaryAsset {
  cloud: string;
  version: string;
  publicId: string;
}

const CLOUDINARY_UPLOAD = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(.+)$/;

/** La foto original de Cloudinary detrás de una URL de la galería, sin las transformaciones que ya traiga. */
export function parseCloudinaryAsset(url: string): CloudinaryAsset | null {
  const match = CLOUDINARY_UPLOAD.exec(url.trim());
  if (!match) return null;
  const [, cloud, rest] = match;
  const parts = rest.split("/");
  const versionAt = parts.findIndex((part) => /^v\d+$/.test(part));
  if (versionAt < 0 || versionAt === parts.length - 1) return null;
  return { cloud, version: parts[versionAt], publicId: parts.slice(versionAt + 1).join("/") };
}

export const cloudinaryUrl = (asset: CloudinaryAsset, transformation: string) =>
  `https://res.cloudinary.com/${asset.cloud}/image/upload/${transformation}/${asset.version}/${asset.publicId}`;

export interface GalleryImage {
  url: string;
  isMain?: boolean | null;
  brokenAt?: Date | string | null;
}

/**
 * Las fotos utilizables en el orden en que llegan (el de la galería), con la
 * principal primero. Sin rotas, sin repetidas, solo de Cloudinary.
 */
function usableAssets(images: readonly GalleryImage[]) {
  const seen = new Set<string>();
  const ordered = [...images.filter((image) => image.isMain), ...images.filter((image) => !image.isMain)];
  return ordered.flatMap((image) => {
    if (image.brokenAt) return [];
    const asset = parseCloudinaryAsset(image.url);
    if (!asset) return [];
    const key = `${asset.version}/${asset.publicId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ sourceUrl: image.url.trim(), asset }];
  });
}

export function buildImagePack(images: readonly GalleryImage[]): ImagePackPicture[] {
  const assets = usableAssets(images);
  if (assets.length === 0) return [];
  const [main, ...rest] = assets;
  const pictures: Omit<ImagePackPicture, "position">[] = [
    { kind: "portada", sourceUrl: main.sourceUrl, transformation: COVER_TRANSFORMATION, url: cloudinaryUrl(main.asset, COVER_TRANSFORMATION) },
    { kind: "foto-principal", sourceUrl: main.sourceUrl, transformation: PHOTO_TRANSFORMATION, url: cloudinaryUrl(main.asset, PHOTO_TRANSFORMATION) },
    ...rest.map((item) => ({
      kind: "foto" as const,
      sourceUrl: item.sourceUrl,
      transformation: PHOTO_TRANSFORMATION,
      url: cloudinaryUrl(item.asset, PHOTO_TRANSFORMATION),
    })),
  ];
  return pictures.slice(0, MERCADOLIBRE_IMAGE_PACK_MAX_PICTURES).map((picture, index) => ({ ...picture, position: index + 1 }));
}

/** Transformaciones que cuesta generar el paquete la primera vez. */
export const imagePackCost = (pack: readonly ImagePackPicture[]) =>
  pack.reduce((sum, picture) => sum + (picture.kind === "portada" ? BACKGROUND_REMOVAL_TRANSFORMATIONS : 1), 0);
