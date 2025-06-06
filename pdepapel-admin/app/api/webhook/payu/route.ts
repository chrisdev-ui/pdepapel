import { sendOrderEmail } from "@/lib/email";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { formatPayUValue, generatePayUSignature } from "@/lib/utils";
import {
  Coupon,
  Order,
  OrderItem,
  OrderStatus,
  PaymentDetails,
  PaymentMethod,
  Product,
  ShippingStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

type PayUResponse = {
  sign: string;
  merchantId: string;
  referenceSale: string;
  statePol: string;
  currency: string;
  value: string;
  transactionId: string;
  referencePol: string;
  emailBuyer?: string;
  paymentMethodName?: string;
};

export async function POST(req: Request) {
  try {
    const data = await req.formData();
    return await processWebhookPayment(data);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Internal server error processing webhook: ${
          error?.message || error?.data?.message
        }`,
      },
      { status: 500 },
    );
  }
}

async function processWebhookPayment(formData: FormData) {
  const response: PayUResponse = {
    sign: formData.get("sign")?.toString() || "",
    merchantId: formData.get("merchant_id")?.toString() || "",
    referenceSale: formData.get("reference_sale")?.toString() || "",
    statePol: formData.get("state_pol")?.toString() || "",
    currency: formData.get("currency")?.toString() || "",
    value: formData.get("value")?.toString() || "",
    transactionId: formData.get("transaction_id")?.toString() || "",
    referencePol: formData.get("reference_pol")?.toString() || "",
    emailBuyer: formData.get("email_buyer")?.toString() || "",
    paymentMethodName: formData.get("payment_method_name")?.toString() || "",
  };
  if (isValidSignature(response)) {
    try {
      const order = await prismadb.order.findFirst({
        where: {
          id: response.referenceSale,
        },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          payment: true,
          coupon: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!order)
        return NextResponse.json(
          { error: `Order not found: ${response.referenceSale}` },
          { status: 400 },
        );
      return await updateOrderData({
        order,
        transaction: {
          id: response.transactionId,
          statePol: response.statePol,
          customer_email: response.emailBuyer,
          payment_method_name: response.paymentMethodName,
          reference_pol: response.referencePol,
        },
      });
    } catch (error: any) {
      return NextResponse.json(
        {
          error: `Error finding order for payu webhook: ${
            error?.message || error?.data?.message
          }`,
        },
        { status: 400 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "Signature is not valid" },
      { status: 400 },
    );
  }
}

function isValidSignature(response: PayUResponse): boolean {
  const { sign, merchantId, referenceSale, statePol, currency, value } =
    response;

  if (
    !sign ||
    !merchantId ||
    !referenceSale ||
    !statePol ||
    !currency ||
    !value
  )
    return false;

  const newValue = formatPayUValue(value);

  const hash = generatePayUSignature({
    apiKey: env.PAYU_API_KEY,
    merchantId,
    referenceCode: referenceSale,
    amount: newValue,
    currency,
    statePol,
  });
  return hash === sign;
}

async function updateOrderData({
  order,
  transaction,
}: {
  order: Order & {
    orderItems: (OrderItem & {
      product: Product;
    })[];
    payment: PaymentDetails | null;
    coupon: { id: Coupon["id"] } | null;
  };
  transaction: {
    id: string;
    statePol: string;
    customer_email?: string;
    payment_method_name?: string;
    reference_pol: string;
  };
}) {
  try {
    const currentStatus = applyStatus(transaction.statePol);
    await prismadb.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: currentStatus,
      },
    });
    if (currentStatus === OrderStatus.PAID) {
      await prismadb.$transaction(async (tx) => {
        for (const orderItem of order.orderItems) {
          const product = await tx.product.findUnique({
            where: { id: orderItem.productId },
          });

          if (!product) {
            throw new Error(`Product ${orderItem.productId} not found.`);
          }

          if (product.stock >= orderItem.quantity) {
            await tx.product.update({
              where: { id: orderItem.productId },
              data: {
                stock: {
                  decrement: orderItem.quantity,
                },
              },
            });
          } else {
            throw new Error(
              `Product ${product.name} is out of stock. Please contact the store owner.`,
            );
          }
        }

        if (order.coupon) {
          await tx.coupon.update({
            where: { id: order.coupon.id },
            data: {
              usedCount: {
                increment: 1,
              },
            },
          });
        }
      });
    } else if (currentStatus === OrderStatus.CANCELLED) {
      if (order.coupon) {
        await prismadb.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              coupon: { disconnect: true },
              couponDiscount: 0,
            },
          });
        });
      }
    }

    await prismadb.paymentDetails.upsert({
      where: {
        orderId: order.id,
      },
      update: {
        transactionId: transaction.id,
        details: `customer_email: ${
          transaction?.customer_email ?? "undefined"
        } | payment_method_type: ${
          transaction?.payment_method_name ?? "undefined"
        } | reference_pol: ${transaction?.reference_pol ?? "undefined"}`,
      },
      create: {
        method: PaymentMethod.PayU,
        transactionId: transaction.id,
        details: `customer_email: ${
          transaction?.customer_email ?? "undefined"
        } | payment_method_type: ${
          transaction?.payment_method_name ?? "undefined"
        } | reference_pol: ${transaction?.reference_pol ?? "undefined"}`,
        store: {
          connect: {
            id: order.storeId,
          },
        },
        order: {
          connect: {
            id: order.id,
          },
        },
      },
    });
    await prismadb.shipping.upsert({
      where: {
        orderId: order.id,
      },
      update: {
        status: ShippingStatus.Preparing,
      },
      create: {
        status: ShippingStatus.Preparing,
        store: {
          connect: {
            id: order.storeId,
          },
        },
        order: {
          connect: {
            id: order.id,
          },
        },
      },
    });

    // Fetch updated order with relations needed for the email
    const updatedOrder = await prismadb.order.findUnique({
      where: { id: order.id },
      include: {
        payment: true,
        shipping: true,
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    // Send email notification (admin + customer)
    if (updatedOrder) {
      await sendOrderEmail(
        {
          ...updatedOrder,
          payment: updatedOrder.payment?.method ?? undefined,
        },
        currentStatus,
      );
    }
    return NextResponse.json(null, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Internal server error updating order data: ${
          error?.data?.message || error?.message
        }`,
      },
      { status: 500 },
    );
  }
}

function applyStatus(status: string): OrderStatus {
  switch (Number(status)) {
    case 4:
      return OrderStatus.PAID;
    case 6:
    case 5:
      return OrderStatus.CANCELLED;
    default:
      return OrderStatus.PENDING;
  }
}
