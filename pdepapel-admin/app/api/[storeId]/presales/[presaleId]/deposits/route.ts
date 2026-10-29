import { auth } from "@clerk/nextjs/server";
import {
  OrderPaymentPlan,
  OrderSource,
  OrderStatus,
  OrderType,
  PreorderWaitlistStatus,
  PresalePaymentMode,
  ProductPresaleStatus,
  ShippingProvider,
  ShippingStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { requireJsonBody } from "@/lib/request-body";
import { parseManualPaymentBody, settleDepositPayment } from "@/lib/order-payments";
import { normalizePhone } from "@/lib/phone";
import {
  DEPOSIT_PRESALE_SHIPPING_LABEL,
  getActivePresalesByProduct,
  getPresaleCapacity,
  presaleUnitDeposit,
  presaleUnitsForOrder,
} from "@/lib/presale";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS, generateOrderNumber } from "@/lib/utils";

/**
 * «Marcar anticipo recibido»: Paula anota un anticipo que recibió por fuera de
 * la pasarela (transferencia, efectivo, datáfono). Dos entradas:
 *
 * - `order`: un pedido de la tienda con anticipo, todavía pendiente.
 * - `waitlist`: alguien de la lista de espera que pagó por WhatsApp. Se crea el
 *   pedido (nombre y teléfono de la lista; correo y dirección se completan
 *   después) y queda con el anticipo recibido.
 *
 * Por defecto NO le avisa a la clienta (`notifyCustomer` ausente = false); el
 * aviso omitido queda en «Avisos a la clienta». Nunca descuenta inventario de
 * una preventa sin liberar ni escribe `paidAt`.
 */

const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("order"), orderId: z.string().trim().min(1) }),
  z.object({
    kind: z.literal("waitlist"),
    entryId: z.string().trim().min(1),
    quantity: z.number().int().min(1).max(20).default(1),
  }),
]);

/**
 * El primer pago a mano: al menos el anticipo de las unidades (abonos libres:
 * puede ser más) y nunca más que el total del pedido.
 */
function assertDepositAmount(amount: number, minimum: number, total: number) {
  if (amount < minimum) {
    throw ErrorFactory.InvalidRequest(`El anticipo mínimo es ${minimum.toLocaleString("es-CO")} pesos.`);
  }
  if (amount > total) {
    throw ErrorFactory.InvalidRequest(`El pago pasa del total del pedido (${total.toLocaleString("es-CO")} pesos).`);
  }
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; presaleId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await requireJsonBody<Record<string, unknown>>(req, "PRESALE_DEPOSIT_POST");
    const parsedSource = sourceSchema.safeParse(body?.source);
    if (!parsedSource.success) throw ErrorFactory.InvalidRequest("Falta de dónde sale el anticipo (pedido o lista de espera)");
    const source = parsedSource.data;
    const payment = parseManualPaymentBody(body);

    const presale = await prismadb.productPresale.findFirst({
      where: { id: params.presaleId, storeId: params.storeId },
      include: { product: { include: { images: true } } },
    });
    if (!presale) throw ErrorFactory.NotFound("La preventa no existe en esta tienda");
    if (presale.paymentMode !== PresalePaymentMode.DEPOSIT) {
      throw ErrorFactory.InvalidRequest("Esta preventa se paga completa: usa «Marcar como pagado» en el pedido.");
    }

    let orderId: string;
    if (source.kind === "order") {
      const order = await prismadb.order.findFirst({
        where: { id: source.orderId, storeId: params.storeId },
        select: { id: true, paymentPlan: true, status: true, depositAmount: true, total: true, giftCardAmount: true, orderItems: { select: { presaleId: true } } },
      });
      if (!order) throw ErrorFactory.NotFound("El pedido no existe en esta tienda");
      if (order.paymentPlan !== OrderPaymentPlan.DEPOSIT || !order.orderItems.some((item) => item.presaleId === presale.id)) {
        throw ErrorFactory.InvalidRequest("Este pedido no es de esta preventa con anticipo.");
      }
      if (order.status === OrderStatus.DEPOSIT_PAID) {
        throw ErrorFactory.Conflict("Este pedido ya tiene anticipo: anota el pago con «Registrar abono».");
      }
      assertDepositAmount(payment.amount, Math.round(Number(order.depositAmount ?? 0)), Math.round(order.total - Number(order.giftCardAmount ?? 0)));
      orderId = order.id;
      await prismadb.paymentDetails.updateMany({ where: { orderId: order.id }, data: { method: payment.method } });
    } else {
      if (presale.status !== ProductPresaleStatus.ACTIVE) throw ErrorFactory.InvalidRequest("Esta preventa ya no está activa");
      const entry = await prismadb.preorderWaitlistEntry.findFirst({
        where: { id: source.entryId, storeId: params.storeId, productId: presale.productId },
      });
      if (!entry) throw ErrorFactory.NotFound("Esa persona no está en la lista de espera de este producto");
      if (entry.status === PreorderWaitlistStatus.CONVERTED || entry.status === PreorderWaitlistStatus.DISCARDED) {
        throw ErrorFactory.Conflict(
          entry.status === PreorderWaitlistStatus.CONVERTED ? "Esa persona ya tiene su pedido con anticipo." : "Esa persona está descartada.",
        );
      }

      const capacity = (await getActivePresalesByProduct(params.storeId, [presale.productId])).get(presale.productId);
      const room = capacity ? presaleUnitsForOrder(getPresaleCapacity(capacity)) : 0;
      if (room < source.quantity) {
        throw ErrorFactory.Conflict(room === 0 ? "La preventa ya no tiene cupo." : `Solo caben ${room} unidades en este pedido.`);
      }

      const unitPrice = Math.round(presale.product.price);
      const depositAmount = presaleUnitDeposit(presale, unitPrice) * source.quantity;
      const subtotal = unitPrice * source.quantity;
      assertDepositAmount(payment.amount, depositAmount, subtotal);
      const image = presale.product.images.find((img) => img.isMain)?.url || presale.product.images[0]?.url || "";
      const created = await prismadb.order.create({
        data: {
          storeId: params.storeId,
          orderNumber: generateOrderNumber(),
          status: OrderStatus.PENDING,
          type: OrderType.STANDARD,
          source: OrderSource.PANEL,
          createdBy: userId,
          fullName: entry.name,
          phone: normalizePhone(entry.phone ?? "") ?? entry.phone ?? "",
          email: entry.email ?? "",
          subtotal,
          total: subtotal,
          paymentPlan: OrderPaymentPlan.DEPOSIT,
          depositAmount,
          adminNotes: "Pedido creado al anotar el anticipo desde la lista de espera. Completa correo y dirección antes de cobrar el saldo.",
          orderItems: {
            create: [
              {
                productId: presale.productId,
                name: presale.product.name,
                price: unitPrice,
                quantity: source.quantity,
                sku: presale.product.sku || "N/A",
                imageUrl: image,
                isPreorder: true,
                presaleId: presale.id,
              },
            ],
          },
          payment: { create: { storeId: params.storeId, method: payment.method } },
          shipping: {
            create: {
              storeId: params.storeId,
              provider: ShippingProvider.MANUAL,
              status: ShippingStatus.Preparing,
              cost: 0,
              carrierName: DEPOSIT_PRESALE_SHIPPING_LABEL,
            },
          },
        },
        select: { id: true },
      });
      orderId = created.id;
    }

    const result = await settleDepositPayment({
      orderId,
      storeId: params.storeId,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt,
      source: "manual",
      createdBy: userId,
      note: payment.note,
      notifyCustomer: payment.notifyCustomer,
    });
    if (result.outcome === "late-on-cancelled") throw ErrorFactory.Conflict("El pedido está cancelado: no se le puede anotar un anticipo.");

    if (source.kind === "waitlist") {
      await prismadb.preorderWaitlistEntry.update({
        where: { id: source.entryId },
        data: { status: PreorderWaitlistStatus.CONVERTED, orderId },
      });
    }

    return NextResponse.json(
      { orderId, outcome: result.outcome, paymentId: "paymentId" in result ? result.paymentId : null },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRESALE_DEPOSIT_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
    });
  }
}
