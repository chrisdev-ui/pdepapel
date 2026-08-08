import { MarketplaceConnectionStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { requestMercadoLibreJson } from "./client";

const BILLING_ORDER_DETAILS_RESOURCE =
  "/billing/integration/group/ML/order/details";

type UnknownRecord = Record<string, unknown>;

export type MercadoLibreOrderFinancials = {
  marketplaceFee: number;
  shippingCost: number;
  taxesAmount: number;
  netAmount: number;
  moneyReleaseDate: string | null;
  moneyReleaseStatus: string | null;
};

export class MercadoLibreFinancialsPendingError extends Error {
  constructor(
    message = "Mercado Libre aún no publicó la liquidación de la venta",
  ) {
    super(message);
    this.name = "MercadoLibreFinancialsPendingError";
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getNonNegativeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function getAppliedTaxes(paymentInfo: unknown) {
  if (!Array.isArray(paymentInfo)) return 0;

  return paymentInfo.reduce((total, payment) => {
    if (!isRecord(payment) || !Array.isArray(payment.tax_details)) {
      return total;
    }

    return (
      total +
      payment.tax_details.reduce((taxTotal, tax) => {
        if (!isRecord(tax) || tax.tax_status !== "applied") return taxTotal;
        const originalAmount = getNonNegativeNumber(tax.original_amount);
        if (originalAmount === null) return taxTotal;
        const refundedAmount = getNonNegativeNumber(tax.refunded_amount) ?? 0;
        return taxTotal + Math.max(0, originalAmount - refundedAmount);
      }, 0)
    );
  }, 0);
}

function isShippingCharge(detail: UnknownRecord) {
  if (isRecord(detail.shipping_info)) return true;

  const marketplace = isRecord(detail.marketplace_info)
    ? detail.marketplace_info.marketplace
    : null;
  if (marketplace === "SHIPPING") return true;

  const chargeInfo = isRecord(detail.charge_info) ? detail.charge_info : null;
  return chargeInfo?.detail_sub_type === "CXD";
}

function getOperationCharges(details: unknown) {
  if (!Array.isArray(details)) {
    throw new MercadoLibreFinancialsPendingError();
  }

  return details.reduce(
    (totals, detail) => {
      if (!isRecord(detail) || !isRecord(detail.charge_info)) return totals;
      const chargeInfo = detail.charge_info;
      if (
        chargeInfo.debited_from_operation !== "YES" ||
        chargeInfo.detail_type !== "CHARGE"
      ) {
        return totals;
      }

      const amount = getNonNegativeNumber(chargeInfo.detail_amount);
      if (amount === null) return totals;

      if (isShippingCharge(detail)) {
        totals.shippingCost += amount;
      } else {
        totals.marketplaceFee += amount;
      }
      return totals;
    },
    { marketplaceFee: 0, shippingCost: 0 },
  );
}

function getMoneyRelease(paymentInfo: unknown) {
  if (!Array.isArray(paymentInfo)) {
    return { moneyReleaseDate: null, moneyReleaseStatus: null };
  }

  const releasedPayment = paymentInfo.find(isRecord);
  if (!releasedPayment) {
    return { moneyReleaseDate: null, moneyReleaseStatus: null };
  }

  return {
    moneyReleaseDate: getString(releasedPayment.money_release_date),
    moneyReleaseStatus: getString(releasedPayment.money_release_status),
  };
}

export function parseMercadoLibreOrderFinancials(
  payload: unknown,
  externalOrderId: string,
  totalAmount: number,
): MercadoLibreOrderFinancials {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new MercadoLibreFinancialsPendingError();
  }

  const financialOrder = payload.results.find(
    (result) =>
      isRecord(result) && getString(result.order_id) === externalOrderId,
  );
  if (!isRecord(financialOrder)) {
    throw new MercadoLibreFinancialsPendingError();
  }

  const charges = getOperationCharges(financialOrder.details);
  const taxesAmount = getAppliedTaxes(financialOrder.payment_info);
  const moneyRelease = getMoneyRelease(financialOrder.payment_info);

  return {
    ...charges,
    taxesAmount,
    netAmount:
      totalAmount - charges.marketplaceFee - charges.shippingCost - taxesAmount,
    ...moneyRelease,
  };
}

export async function getMercadoLibreOrderFinancials(
  connectionId: string,
  externalOrderId: string,
  totalAmount: number,
) {
  const resource = new URL(
    BILLING_ORDER_DETAILS_RESOURCE,
    "https://api.mercadolibre.com",
  );
  resource.searchParams.set("order_ids", externalOrderId);

  const response = await requestMercadoLibreJson(
    connectionId,
    resource.pathname + resource.search,
  );
  if (response.status === 206) {
    throw new MercadoLibreFinancialsPendingError(
      "Mercado Libre devolvió una liquidación parcial y se revisará de nuevo más tarde",
    );
  }
  if (!response.ok) {
    if (
      response.status === 400 ||
      response.status === 404 ||
      response.status === 429
    ) {
      throw new MercadoLibreFinancialsPendingError();
    }
    if (response.status === 401 || response.status === 403) {
      await prismadb.marketplaceConnection.update({
        where: { id: connectionId },
        data: {
          status: MarketplaceConnectionStatus.REAUTH_REQUIRED,
          lastError:
            response.status === 403
              ? "Mercado Libre requiere el permiso de Facturación de una venta en Lectura. Actívalo en la aplicación y reconecta la cuenta."
              : "Mercado Libre rechazó la consulta de liquidación. Reconecta la cuenta para continuar.",
        },
      });
    }
    throw new Error(
      `No fue posible consultar la liquidación de Mercado Libre (${response.status})`,
    );
  }

  return parseMercadoLibreOrderFinancials(
    response.payload,
    externalOrderId,
    totalAmount,
  );
}
