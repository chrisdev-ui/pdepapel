import { Prisma } from "@prisma/client";

import { richTextToPlainText } from "@/lib/rich-text";

import { getMercadoLibreAttributes } from "./listing-metadata";

export type MercadoLibreContentReview = {
  title: string;
  titleLength: number;
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
  const title = product.name.trim();
  const description = richTextToPlainText(product.description)
    .replace(/\s+/g, " ")
    .trim();
  const attributes = getMercadoLibreAttributes(metadata);
  const hasIdentifier = Boolean(product.gtin || product.mpn || product.brand);

  return {
    title,
    titleLength: title.length,
    descriptionPreview: truncate(description, 280),
    checks: [
      {
        label: "Título",
        ready: title.length > 0 && title.length <= 60,
        detail:
          title.length > 60
            ? "Tiene más de 60 caracteres; acórtalo antes de publicar."
            : "Es claro y está dentro de una longitud habitual para una publicación.",
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
        ready: product.images.length >= 3,
        detail:
          product.images.length >= 3
            ? "Cuenta con tres o más fotos para mostrar el producto."
            : "Se recomienda agregar más ángulos o detalles del producto.",
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
