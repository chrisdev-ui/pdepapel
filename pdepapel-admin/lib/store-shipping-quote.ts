import { AppError, ErrorFactory } from "@/lib/api-errors";
import { SHIPPING_RATE_INCIDENT, countIncident } from "@/lib/incident-counter";
import prismadb from "@/lib/prismadb";
import { requoteCartShipping, type RequotedRate } from "@/lib/shipping-helpers";
import { readCachedRates, reconcileShippingRate } from "@/lib/shipping-rate-reconcile";
import { currencyFormatter } from "@/lib/utils";

/** Contra entrega y la transportadora elegida no recauda en ese destino. */
export const COD_UNAVAILABLE_MESSAGE =
  "La transportadora que elegiste no recibe pago contra entrega en tu ciudad. Elige otra que sí lo haga o paga en línea.";

/**
 * Qué hacer con la tarifa después de re-cotizar.
 *
 * Manda el servicio (misma transportadora y mismo producto), no el `idRate`,
 * que cambia con las medidas del paquete. Si el precio es el de antes (o
 * casi), se sigue sin interrumpir. Si cambió de verdad, 409 con la tarifa
 * nueva para que la tienda la enseñe y la clienta decida.
 */
export function resolveRequotedRate(input: {
  rateId: number;
  freshRates: RequotedRate[];
  previousCost: number | null;
  previousCarrier?: string | null;
  previousProduct?: string | null;
  storeId: string;
  daneCode: string;
  /** Contra entrega: `freshRates` ya trae solo tarifas que recaudan. */
  codRequired?: boolean;
  /** Envío gratis: la clienta no paga el flete, así que un cambio de precio no la detiene. */
  acceptPriceChange?: boolean;
}): RequotedRate {
  const result = reconcileShippingRate(input);

  if (result.outcome === "same") {
    console.log(`✅ Re-cotizado ${input.rateId} → ${result.rate.idRate}: ${result.rate.carrier}, ${currencyFormatter(result.rate.totalCost)}`);
    return result.rate;
  }

  void countIncident({ ...SHIPPING_RATE_INCIDENT, context: { daneCode: input.daneCode, outcome: result.outcome } });

  if (result.outcome === "price_changed" && input.acceptPriceChange) return result.rate;

  if (result.outcome === "price_changed") {
    console.warn("[ORDER_CHECKOUT] El envío cambió de precio al re-cotizar", {
      storeId: input.storeId,
      daneCode: input.daneCode,
      carrier: result.rate.carrier,
      antes: result.previousCost,
      ahora: result.rate.totalCost,
    });
    throw new AppError(`El envío con ${result.rate.carrier} cambió a ${currencyFormatter(result.rate.totalCost)}. Confírmalo para continuar.`, 409, {
      code: "SHIPPING_RATE_CHANGED",
      rate: result.rate,
      previousCost: result.previousCost,
    });
  }

  console.error("[ORDER_CHECKOUT] La transportadora elegida ya no cubre el destino", {
    storeId: input.storeId,
    daneCode: input.daneCode,
    rateId: input.rateId,
    alternativas: result.alternatives.length,
  });
  throw new AppError(
    input.codRequired ? COD_UNAVAILABLE_MESSAGE : "Esa transportadora ya no tiene cobertura para tu dirección. Elige otra opción de envío.",
    409,
    { code: "SHIPPING_RATE_UNAVAILABLE", alternatives: result.alternatives },
  );
}

/**
 * La tarifa de EnvioClick que vale para un pedido de la tienda, nunca el
 * monto que manda quien compra: la de una cotización vigente para ese destino
 * con el mismo `idRate`, o una nueva cotización contra la transportadora
 * (`resolveRequotedRate`). Contra entrega solo acepta tarifas que recaudan.
 * La usan `/checkout` y `POST /orders` (transferencia y contra entrega).
 */
export async function resolveStoreShippingRate(input: {
  storeId: string;
  items: { productId: string; quantity: number }[];
  daneCode: string;
  address: string;
  /** Valor declarado del contenido (y a recaudar, si es contra entrega). */
  contentValue: number;
  rateId: number;
  wantsCOD: boolean;
  /** Lo que la clienta tenía a la vista: solo sirve para reconocer el servicio y avisar si cambió. */
  previous: { cost: number | null; carrier?: string | null; product?: string | null };
  /** Envío gratis: el flete no lo paga la clienta y un cambio de precio no la detiene. */
  freeShipping?: boolean;
  logTag?: string;
}): Promise<RequotedRate> {
  const tag = input.logTag ?? "[ORDER_CHECKOUT]";
  const requote = async () => {
    let freshRates: RequotedRate[];
    try {
      freshRates = await requoteCartShipping({
        storeId: input.storeId,
        items: input.items,
        destination: { daneCode: input.daneCode, address: input.address },
        contentValue: input.contentValue,
        ...(input.wantsCOD && { cod: { value: input.contentValue } }),
      });
    } catch (quoteError) {
      console.error(`${tag} Re-cotización fallida:`, quoteError);
      throw ErrorFactory.InvalidRequest("No pudimos confirmar el costo de envío en este momento. Solicita una nueva cotización e inténtalo de nuevo.");
    }
    return resolveRequotedRate({
      rateId: input.rateId,
      freshRates: input.wantsCOD ? freshRates.filter((rate) => rate.isCOD) : freshRates,
      previousCost: input.previous.cost,
      previousCarrier: input.previous.carrier,
      previousProduct: input.previous.product,
      storeId: input.storeId,
      daneCode: input.daneCode,
      codRequired: input.wantsCOD,
      acceptPriceChange: input.freeShipping,
    });
  };

  const caches = await prismadb.shippingQuote.findMany({
    where: { storeId: input.storeId, destDaneCode: input.daneCode, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  for (const cache of caches) {
    const found = readCachedRates(cache.quotesData).find((rate) => rate.idRate === input.rateId);
    if (found && (!input.wantsCOD || found.isCOD)) {
      console.log(`✅ Using cached quote for rate ID ${input.rateId}, carrier: ${found.carrier}, cost: ${currencyFormatter(found.totalCost)}`);
      return found;
    }
  }
  // Sin la tarifa en una cotización vigente (vencida, o un número inventado): se cotiza contra la transportadora.
  console.warn(`⚠️ Rate ID ${input.rateId} not found in active caches for store ${input.storeId}. Re-cotizando.`);
  return requote();
}
