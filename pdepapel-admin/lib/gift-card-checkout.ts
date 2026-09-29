import { OrderInventoryIssueKind, OrderStatus, PaymentMethod, ShippingStatus, type Prisma } from "@prisma/client";

import { markWelcomeBenefitRedeemed } from "@/lib/customer-benefits";
import { calculateOrderFinancials } from "@/lib/financial";
import { createInventoryMovementBatchResilient } from "@/lib/inventory";
import { recordInventoryIssues } from "@/lib/order-inventory-issues";
import { explodeKitMovements } from "@/lib/order-stock-movements";
import { settlePresaleLinesOnPayment } from "@/lib/presale";

type Tx = Prisma.TransactionClient;

type SettleableOrder = {
  id: string;
  storeId: string;
  orderNumber: string;
  total: number;
  userId: string | null;
  orderItems: {
    productId: string | null;
    quantity: number;
    product?: { acqPrice: number | null; price: number } | null;
  }[];
  coupon?: { id: string; isWelcomeBenefit: boolean } | null;
  shippingCost?: number | null;
};

/**
 * Un pedido que la tarjeta de regalo cubre entero nace PAGADO: nunca pasa
 * por una pasarela, así que ningún webhook va a hacer lo que hace un pago
 * confirmado. Esto aplica, dentro de la misma transacción del checkout, lo
 * mismo que el webhook de Bold al aprobar: preventas, inventario con
 * incidencias, financieros, cupón y beneficio de bienvenida, fecha de pago
 * y envío en preparación. El método de pago queda como GiftCard.
 */
export async function settleFullyCoveredOrder(
  tx: Tx,
  order: SettleableOrder,
  input: { createdBy: string; shippingCost: number },
) {
  await settlePresaleLinesOnPayment(tx, order.id);

  const movements = order.orderItems
    .filter((item) => item.productId && item.product)
    .map((item) => ({
      productId: item.productId as string,
      storeId: order.storeId,
      type: "ORDER_PLACED" as const,
      quantity: -item.quantity,
      reason: `Orden #${order.orderNumber} (tarjeta de regalo)`,
      referenceId: order.id,
      cost: Number(item.product!.acqPrice) || 0,
      price: Number(item.product!.price),
      createdBy: input.createdBy,
    }));
  const exploded = await explodeKitMovements(tx, movements);
  const stockResult = await createInventoryMovementBatchResilient(tx, exploded);
  if (stockResult.failed.length > 0) {
    await recordInventoryIssues(tx, {
      storeId: order.storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      kind: OrderInventoryIssueKind.DECREMENT,
      failed: stockResult.failed,
    });
  }

  if (order.coupon) {
    await tx.coupon.update({ where: { id: order.coupon.id }, data: { usedCount: { increment: 1 } } });
    if (order.coupon.isWelcomeBenefit && order.userId) {
      await markWelcomeBenefitRedeemed(tx, { couponId: order.coupon.id, userId: order.userId, orderId: order.id });
    }
  }

  const financials = await calculateOrderFinancials(order as never, PaymentMethod.GiftCard, input.shippingCost, tx);
  await tx.order.update({
    where: { id: order.id },
    data: { ...financials, status: OrderStatus.PAID, paidAt: new Date() },
  });
  await tx.paymentDetails.update({
    where: { orderId: order.id },
    data: { method: PaymentMethod.GiftCard, transactionId: `GIFTCARD-${order.orderNumber}` },
  });
  await tx.shipping.updateMany({ where: { orderId: order.id }, data: { status: ShippingStatus.Preparing } });
}
