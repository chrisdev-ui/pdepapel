import { ProductPresaleStatus } from "@prisma/client";

import { describePresaleArrival } from "@/lib/presale-copy";
import { presaleUnitDeposit } from "@/lib/presale-deposit";
import prismadb from "@/lib/prismadb";
import { currencyFormatter } from "@/lib/utils";
import { normalizeBotText } from "@/lib/whatsapp/bot-matching";
import { STORE_ORIGIN } from "@/lib/whatsapp/search-intent";

/**
 * Respuesta del bot cuando preguntan por un producto en preventa. La búsqueda
 * de productos solo ve lo que hay en bodega, así que un producto en preventa
 * (stock 0) salía como «no lo tenemos». Es texto plano, fuera de
 * `PRODUCT_TEMPLATES`: no toca la aprobación de las respuestas de productos.
 * Lo que Paula escriba como respuesta por palabra clave gana (va antes).
 */

const STOPWORDS = new Set(["de", "del", "la", "las", "el", "los", "para", "con", "por", "una", "uno", "unos", "unas", "tienen", "tiene", "hay"]);

function tokens(text: string): string[] {
  return normalizeBotText(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
    .map((token) => (token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token));
}

/**
 * La pregunta nombra el producto: al menos dos palabras de su nombre (o la
 * única, si el nombre tiene una sola). «calendario de adviento» encuentra
 * «Calendario de adviento Kiut Love Letters»; «adviento» solo, no.
 */
export function mentionsPresaleProduct(message: string, productName: string): boolean {
  const wanted = Array.from(new Set(tokens(productName)));
  if (wanted.length === 0) return false;
  const said = new Set(tokens(message));
  const hits = wanted.filter((token) => said.has(token)).length;
  return wanted.length === 1 ? hits === 1 : hits >= 2;
}

export interface PresaleAnswerInput {
  name: string;
  slug: string;
  price: number;
  presale: {
    paymentMode: "FULL" | "DEPOSIT" | string;
    depositType: "FIXED" | "PERCENT" | null;
    depositValue: number | null;
    expectedArrivalAt: Date | null;
    expectedArrivalText: string | null;
  };
}

export function buildPresaleAnswer(product: PresaleAnswerInput): string {
  const price = Math.round(product.price);
  const arrival = describePresaleArrival(product.presale);
  const link = `${STORE_ORIGIN}/producto/${product.slug}`;
  if (product.presale.paymentMode === "DEPOSIT") {
    const deposit = presaleUnitDeposit(product.presale as never, price);
    return [
      `¡Sí! ${product.name} está en preventa: cuesta ${currencyFormatter(price)} y lo apartas hoy con ${currencyFormatter(deposit)} de anticipo. El saldo (${currencyFormatter(price - deposit)}) y el envío los pagas cuando llegue. ${arrival}.`,
      `Resérvalo aquí: ${link}`,
      "¿Prefieres esperar? Escribe «lista de espera» y te avisamos cuando llegue.",
    ].join("\n");
  }
  return [
    `¡Sí! ${product.name} está en preventa: cuesta ${currencyFormatter(price)} y se paga al reservar. ${arrival}.`,
    `Resérvalo aquí: ${link}`,
  ].join("\n");
}

/** La preventa activa (de un producto visible en la tienda) que la pregunta nombra, si hay una. */
export async function findPresaleAnswer(storeId: string, message: string): Promise<string | null> {
  const presales = await prismadb.productPresale.findMany({
    where: { storeId, status: ProductPresaleStatus.ACTIVE, product: { isArchived: false } },
    select: {
      paymentMode: true,
      depositType: true,
      depositValue: true,
      expectedArrivalAt: true,
      expectedArrivalText: true,
      product: { select: { name: true, slug: true, price: true } },
    },
    take: 20,
  });
  const match = presales.find((presale) => presale.product.slug && mentionsPresaleProduct(message, presale.product.name));
  if (!match) return null;
  return buildPresaleAnswer({ ...match.product, presale: match });
}
