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

/** El bot no anota en la lista de espera: quien lo pide pasa a Paula (`wantsPreorderWaitlist`). */
export const PRESALE_WAITLIST_OFFER = "Si prefieres esperar, dime y te anoto en la lista de espera.";

const WAITLIST_REQUEST = /\blista de espera\b|\b(anotame|anoteme|anotarme|apuntame|apunteme|apuntarme)\b|\bme (anota|anotas|anotan|apunta|apuntas)\b|\b(prefiero|quiero) esperar/;

/** «Anótame», «lista de espera», «prefiero esperar»: la clienta pide que la anoten. */
export function wantsPreorderWaitlist(message: string): boolean {
  return WAITLIST_REQUEST.test(normalizeBotText(message));
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
      PRESALE_WAITLIST_OFFER,
    ].join("\n");
  }
  return [
    `¡Sí! ${product.name} está en preventa: cuesta ${currencyFormatter(price)} y se paga al reservar. ${arrival}.`,
    `Resérvalo aquí: ${link}`,
  ].join("\n");
}

/**
 * La preventa abierta que la pregunta nombra, si hay una: activa, de un
 * producto visible en la tienda y con cupo. Archivado o sin cupo, el bot
 * contesta como por cualquier producto que no está.
 */
export async function findPresaleAnswer(storeId: string, message: string): Promise<string | null> {
  const presales = await prismadb.productPresale.findMany({
    where: { storeId, status: ProductPresaleStatus.ACTIVE, product: { isArchived: false } },
    select: {
      unitLimit: true,
      committedUnits: true,
      paymentMode: true,
      depositType: true,
      depositValue: true,
      expectedArrivalAt: true,
      expectedArrivalText: true,
      product: { select: { name: true, slug: true, price: true } },
    },
    take: 20,
  });
  const match = presales.find(
    (presale) =>
      presale.product.slug &&
      (presale.unitLimit === null || presale.committedUnits < presale.unitLimit) &&
      mentionsPresaleProduct(message, presale.product.name),
  );
  if (!match) return null;
  return buildPresaleAnswer({ ...match.product, presale: match });
}
