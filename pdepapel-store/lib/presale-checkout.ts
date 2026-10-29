import { OrderStatus, PaymentMethod, ShippingStatus } from "@/constants";
import { PREORDER_TERMS_VERSION } from "@/lib/legal-versions";
import { DEPOSIT_SHIPPING_LABEL } from "@/lib/presale-copy";
import type { CheckoutOrder, Order } from "@/types";

/** Medios con los que se paga un anticipo; contra entrega no (el panel lo rechaza). */
export const DEPOSIT_PAYMENT_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.Bold,
  PaymentMethod.Wompi,
  PaymentMethod.BankTransfer,
];

/** El envío de una preventa con anticipo: sin cotizar, en 0; se cobra con el saldo. */
export const DEPOSIT_SHIPPING = {
  provider: "CUSTOM",
  carrierName: DEPOSIT_SHIPPING_LABEL,
  courier: DEPOSIT_SHIPPING_LABEL,
  productName: "Envío",
  cost: 0,
  flete: 0,
  minimumInsurance: 0,
  deliveryDays: 0,
  isCOD: false,
  status: ShippingStatus.Preparing,
} as const;

/**
 * El pedido de una preventa con anticipo, tal como lo espera `POST /checkout`
 * del panel: sin cupón ni tarjeta de regalo, envío manual en 0, total igual
 * al subtotal de productos y la casilla de condiciones con su versión. El
 * panel vuelve a exigir todo esto; aquí solo se manda coherente.
 */
export function applyDepositCheckout(payload: CheckoutOrder): CheckoutOrder {
  return {
    ...payload,
    couponCode: null,
    giftCardCode: null,
    shippingProvider: "MANUAL",
    envioClickIdRate: 0,
    shipping: { ...DEPOSIT_SHIPPING },
    total: payload.subtotal,
    preorderTermsAccepted: true,
    preorderTermsVersion: PREORDER_TERMS_VERSION,
  };
}

/**
 * A dónde va el pedido. La transferencia normal va a `POST /orders`, que no
 * sabe de anticipos: la de una preventa con anticipo va a `POST /checkout`,
 * que la crea con `paymentPlan: DEPOSIT` y devuelve el pedido.
 */
export function resolveCheckoutEndpoint(data: Pick<CheckoutOrder, "payment" | "preorderTermsAccepted">): "checkout" | "orders" {
  if (data.preorderTermsAccepted === true) return "checkout";
  return data.payment.method === PaymentMethod.BankTransfer || data.payment.method === PaymentMethod.COD
    ? "orders"
    : "checkout";
}

export const isDepositOrder = (order: Pick<Order, "paymentPlan">) => order.paymentPlan === "DEPOSIT";

/**
 * Lo que la clienta debe pagar ahora mismo: el anticipo de una preventa que
 * aún no lo recibe; en cualquier otro caso, el total menos lo que cubrió una
 * tarjeta de regalo.
 */
export function amountDueNow(
  order: Pick<Order, "status" | "total" | "paymentPlan" | "depositAmount" | "giftCardAmount">,
): number {
  const awaitingDeposit = order.status === OrderStatus.PENDING || order.status === OrderStatus.CREATED;
  if (isDepositOrder(order) && awaitingDeposit && Number(order.depositAmount) > 0) {
    return Number(order.depositAmount);
  }
  return Math.max(0, Number(order.total) - Number(order.giftCardAmount ?? 0));
}

/** El saldo de una preventa con anticipo (sin el envío, que se cotiza al llegar). */
export function depositBalance(order: Pick<Order, "total" | "depositAmount">): number {
  return Math.max(0, Number(order.total) - Number(order.depositAmount ?? 0));
}
