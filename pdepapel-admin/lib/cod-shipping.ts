import { AppError, ErrorFactory } from "@/lib/api-errors";
import { quoteWithCodFees } from "@/lib/cod-fee";
import { reconcileShippingRate } from "@/lib/shipping-rate-reconcile";
import { requoteCartShipping, type RequotedRate } from "@/lib/shipping-helpers";
import { currencyFormatter } from "@/lib/utils";

/**
 * Un pedido contra entrega de la tienda (POST /orders, rama de la tienda) con
 * el recaudo que la tienda le mostró a la clienta. El servidor no se cree
 * nada: re-cotiza con recaudo, comprueba el flete de la transportadora
 * elegida, calcula el recaudo (lib/cod-fee.ts) y lo compara con el mostrado.
 * Se llama ANTES de abrir la transacción del pedido: son llamadas a
 * EnvioClick.
 */

/** Diferencia que se tolera entre el recaudo mostrado y el calculado: el redondeo al peso. */
export const COD_FEE_TOLERANCE = 1;

export const COD_UNAVAILABLE_MESSAGE =
  "La transportadora que elegiste no recibe pago contra entrega en tu ciudad. Elige otra que sí lo haga o paga en línea.";

export interface StoreCodShipping {
  idRate: number;
  idCarrier: number | null;
  idProduct: number | null;
  carrier: string;
  product: string;
  flete: number;
  minimumInsurance: number;
  deliveryDays: number;
  /** Lo que se cobra de envío: flete + seguro, o 0 con envío gratis. */
  cost: number;
  codFee: number;
}

const norm = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

export async function resolveStoreCodShipping(input: {
  storeId: string;
  items: { productId: string; quantity: number }[];
  destination: { daneCode: string; address: string };
  /** Total del pedido sin envío ni recaudo, calculado por el servidor. */
  amountBeforeShipping: number;
  freeShipping: boolean;
  chosen: { carrier?: string | null; product?: string | null; cost: number };
  codFeeShown: number;
}): Promise<StoreCodShipping> {
  const carrier = norm(input.chosen.carrier);
  const product = norm(input.chosen.product);
  const sameService = (rate: RequotedRate) => norm(rate.carrier) === carrier && (!product || norm(rate.product) === product);

  let solved: Array<RequotedRate & { codFee: number | null }>;
  try {
    solved = await quoteWithCodFees({
      amountBeforeShipping: input.amountBeforeShipping,
      quote: (codValue) =>
        requoteCartShipping({
          storeId: input.storeId,
          items: input.items,
          destination: input.destination,
          contentValue: input.amountBeforeShipping,
          cod: { value: codValue },
        }),
      shippingOf: (rate) => (input.freeShipping ? 0 : rate.totalCost),
      focus: sameService,
    });
  } catch (error) {
    console.error("[ORDERS_POST] Cotización contra entrega fallida:", error);
    throw ErrorFactory.InvalidRequest(
      "No pudimos confirmar el costo de envío en este momento. Solicita una nueva cotización e inténtalo de nuevo.",
    );
  }

  const collecting = solved.filter((rate) => rate.isCOD && rate.codFee !== null);
  const alternatives = [...collecting].sort((a, b) => a.totalCost - b.totalCost);
  const unavailable = () =>
    new AppError(COD_UNAVAILABLE_MESSAGE, 409, { code: "SHIPPING_RATE_UNAVAILABLE", alternatives });

  let rate: (typeof collecting)[number];
  if (input.freeShipping) {
    // Con envío gratis la clienta no ve el flete: solo importa que la transportadora recaude.
    const candidate = collecting.filter(sameService).sort((a, b) => a.totalCost - b.totalCost)[0];
    if (!candidate) throw unavailable();
    rate = candidate;
  } else {
    const result = reconcileShippingRate({
      rateId: 0,
      freshRates: collecting,
      previousCost: Number.isFinite(input.chosen.cost) ? input.chosen.cost : null,
      previousCarrier: input.chosen.carrier,
      previousProduct: input.chosen.product,
    });
    if (result.outcome === "unavailable") throw unavailable();
    if (result.outcome === "price_changed") {
      throw new AppError(
        `El envío con ${result.rate.carrier} cambió a ${currencyFormatter(result.rate.totalCost)}. Confírmalo para continuar.`,
        409,
        { code: "SHIPPING_RATE_CHANGED", rate: result.rate, previousCost: result.previousCost },
      );
    }
    rate = result.rate as (typeof collecting)[number];
  }

  const codFee = Number(rate.codFee);
  const cost = input.freeShipping ? 0 : rate.totalCost;
  if (Math.abs(codFee - input.codFeeShown) > COD_FEE_TOLERANCE) {
    const newTotal = Math.round((input.amountBeforeShipping + cost + codFee) * 100) / 100;
    throw new AppError(`El recaudo contra entrega cambió a ${currencyFormatter(codFee)}. Confírmalo para continuar.`, 409, {
      code: "SHIPPING_RATE_CHANGED",
      rate: { ...rate, totalCost: cost },
      previousCost: input.freeShipping ? 0 : input.chosen.cost,
      codFee,
      previousCodFee: input.codFeeShown,
      newTotal,
    });
  }

  return {
    idRate: rate.idRate,
    idCarrier: rate.idCarrier ?? null,
    idProduct: rate.idProduct ?? null,
    carrier: rate.carrier,
    product: rate.product,
    flete: input.freeShipping ? 0 : rate.flete,
    minimumInsurance: input.freeShipping ? 0 : rate.minimumInsurance,
    deliveryDays: Number(rate.deliveryDays) || 0,
    cost,
    codFee,
  };
}
