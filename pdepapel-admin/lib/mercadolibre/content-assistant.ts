import { Prisma } from "@prisma/client";

import { richTextToPlainText } from "@/lib/rich-text";

import {
  getMercadoLibreAttributes,
  getMercadoLibreListingImageUrls,
  getMercadoLibreListingMetadata,
} from "./listing-metadata";

export type MercadoLibreContentReview = {
  familyName: string;
  familyNameLength: number;
  descriptionPreview: string;
  checks: { label: string; ready: boolean; detail: string }[];
};

function truncate(value: string, length: number) {
  return value.length <= length
    ? value
    : `${value.slice(0, length - 1).trim()}…`;
}

export function createMercadoLibreContentReview({
  categoryId,
  marketplacePrice,
  metadata,
  product,
}: {
  categoryId: string | null;
  marketplacePrice: number | null;
  metadata: Prisma.JsonValue | null;
  product: {
    name: string;
    description: string;
    brand: string | null;
    gtin: string | null;
    mpn: string | null;
    images: { url: string }[];
  };
}): MercadoLibreContentReview {
  const familyName =
    getMercadoLibreListingMetadata(metadata).familyName ?? product.name.trim();
  const description = richTextToPlainText(product.description)
    .replace(/\s+/g, " ")
    .trim();
  const attributes = getMercadoLibreAttributes(metadata);
  const selectedImageUrls = getMercadoLibreListingImageUrls(
    product.images,
    metadata,
  );
  const pictureCount = selectedImageUrls.length;
  const hasIdentifier = Boolean(product.gtin || product.mpn || product.brand);

  return {
    familyName,
    familyNameLength: familyName.length,
    descriptionPreview: truncate(description, 280),
    checks: [
      {
        label: "Nombre de familia",
        ready: familyName.length > 0 && familyName.length <= 120,
        detail:
          familyName.length > 120
            ? "Tiene más de 120 caracteres; acórtalo antes de publicar."
            : "Agrupa las variaciones sin incluir color, talla o diseño.",
      },
      {
        label: "Descripción",
        ready: description.length >= 80,
        detail:
          description.length >= 80
            ? "Tiene información suficiente para que el comprador revise el producto."
            : "Agrega materiales, medidas, contenido o usos antes de publicar.",
      },
      {
        label: "Fotos",
        ready: pictureCount >= 1,
        detail: pictureCount === 0
          ? "Selecciona al menos una foto antes de publicar."
          : pictureCount >= 3
            ? "Cuenta con tres o más fotos para mostrar el producto."
            : `Puedes publicar con ${pictureCount} foto${pictureCount === 1 ? "" : "s"}; agrega más ángulos o detalles para mejorar la confianza.`,
      },
      {
        label: "Identificador o marca",
        ready: hasIdentifier,
        detail: hasIdentifier
          ? "Marca, GTIN o MPN estarán disponibles para completar la ficha."
          : "Registra marca, GTIN o MPN si el fabricante lo proporciona.",
      },
      {
        label: "Ficha técnica",
        ready: attributes.length > 0,
        detail:
          attributes.length > 0
            ? "La publicación ya tiene características configuradas."
            : "Carga las características requeridas por la categoría elegida.",
      },
      {
        label: "Precio y categoría",
        ready: Boolean(categoryId && marketplacePrice && marketplacePrice > 0),
        detail:
          categoryId && marketplacePrice && marketplacePrice > 0
            ? "La publicación tiene categoría y precio propio de Mercado Libre."
            : "Define una categoría y un precio antes de enviar la publicación.",
      },
    ],
  };
}
