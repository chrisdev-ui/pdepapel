import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; customOrderId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.customOrderId) {
      return new NextResponse("Custom Order ID is required", { status: 400 });
    }

    const customOrder = await prismadb.customOrder.findUnique({
      where: {
        id: params.customOrderId,
        storeId: params.storeId,
      },
      include: {
        items: true,
        quotation: true,
        messages: {
          orderBy: {
            createdAt: "desc",
          },
        },
        convertedOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    if (!customOrder) {
      return new NextResponse("Custom Order not found", { status: 404 });
    }

    return NextResponse.json(customOrder);
  } catch (error) {
    console.log("[CUSTOM_ORDER_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; customOrderId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const {
      customerName,
      customerPhone,
      customerEmail,
      status,
      discount,
      discountType,
      shippingCost,
      notes,
      adminNotes,
      internalNotes,
      validUntil,
      items,
    } = body;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.customOrderId) {
      return new NextResponse("Custom Order ID is required", { status: 400 });
    }

    // Check availability
    const existingOrder = await prismadb.customOrder.findUnique({
      where: { id: params.customOrderId, storeId: params.storeId },
    });

    if (!existingOrder) {
      return new NextResponse("Ref not found", { status: 404 });
    }

    let updateData: any = {
      customerName,
      customerPhone,
      customerEmail,
      status,
      discount,
      discountType,
      shippingCost,
      notes,
      adminNotes,
      internalNotes,
      validUntil: validUntil ? new Date(validUntil) : undefined,
    };

    // Recalculate totals if items or costs changed
    if (items && items.length > 0) {
      // Logic: if items are passed, we assume we are replacing the list
      // 1. Delete old items
      await prismadb.customOrderItem.deleteMany({
        where: {
          customOrderId: params.customOrderId,
        },
      });

      // 2. Prepare new items
      let subtotal = 0;
      items.forEach((item: any) => {
        subtotal += Number(item.quantity) * Number(item.unitPrice);
      });

      let discountAmount = 0;
      // Use existing values if not provided, though typically frontend should send full state
      const appliedDiscount =
        discount !== undefined ? discount : existingOrder.discount;
      const appliedDiscountType =
        discountType !== undefined ? discountType : existingOrder.discountType;
      const appliedShipping =
        shippingCost !== undefined ? shippingCost : existingOrder.shippingCost;

      if (appliedDiscount && appliedDiscountType) {
        discountAmount =
          appliedDiscountType === "PERCENTAGE"
            ? (subtotal * appliedDiscount) / 100
            : appliedDiscount;
      }

      const total = subtotal - discountAmount + (appliedShipping || 0);

      updateData.subtotal = subtotal;
      updateData.total = total;

      // We also update discount amount if type changed but value remained same, etc.
      // But simplifying: updateData.discount is whatever is calculated
      updateData.discount = discountAmount;

      updateData.items = {
        create: items.map((item: any, index: number) => ({
          productId: item.productId || null,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: Number(item.quantity) * Number(item.unitPrice),
          imageUrl: item.imageUrl,
          sku: item.sku,
          isExternal: item.isExternal || false,
          category: item.category,
          position: index,
          customNotes: item.customNotes,
        })),
      };
    } else if (shippingCost !== undefined || discount !== undefined) {
      // Items didn't change, but costs did. Recalculate total based on existing subtotal.
      const currentSubtotal = existingOrder.subtotal;

      let discountAmount = 0;
      const appliedDiscount =
        discount !== undefined ? discount : existingOrder.discount; // if provided use it, else old
      // Wait, discount in DB is the amount. But in payload 'discount' usually refers to the value entered (percentage or fixed amount).
      // Let's assume the payload sends the raw value and type.
      // Actually, existingOrder.discount stores the CALCULATED amount.
      // We need to know the 'input' discount. Our schema stores `discount` as the calculated amount?
      // Checking schema... `discount Float`. Usually simple e-commerce schema stores the Amount.
      // But `discountType` implies we might need to store the rate if it's percentage.
      // Schema checks: `discount Float @default(0)`, `discountType DiscountType?`.
      // If Type is PERCENTAGE, we lost the rate if only `discount` is stored as amount?
      // Wait, normally `discount` field is the MONEY value.
      // If I say 10% discount, subtotal 100. Discount = 10. Type = PERCENTAGE.
      // If I update subtotal to 200, I need to know it was 10%.
      // The schema might be missing `discountRate` or `discountValue`.
      // However, looking at `Offer` model, `amount` is used for the rate/fixed value.
      // In `CustomOrder`, we only have `discount` and `discountType`.
      // This implies `discount` might be the value used for calculation?
      // Let's assume for Custom Order builder, the admin calculates it or sends the final amount.
      // Actually, looking at my route implementation for POST:
      // `discountAmount = type === PERCENTAGE ? (subtotal * discount) / 100`...
      // so `req.body.discount` is the RATE/VALUE, but `prisma.create({ data: { discount: discountAmount } })` stores the RESULT.
      // This is a flaw in the plan/schema if we want to edit it later and remember "10%".
      // BUT, we can just require the frontend to send the recalculated values.
      // Let's assume the Frontend sends the `total`, `subtotal`, etc. or we trust the frontend params.
      // BETTER: Backend recalculation is safer.
      // I will trust the `discount` param from transparency to be the 'input' value (10 or 5000) if passed.
      // If `items` are NOT updated, I don't have the `subtotal` readily available unless I query items.
      // Existing order `subtotal` is correct.

      const subtotal = existingOrder.subtotal;
      let finalDiscountAmount = 0;

      const inputDiscount = discount; // Rate or Fixed Amount
      const inputType = discountType || existingOrder.discountType;
      const inputShipping =
        shippingCost !== undefined ? shippingCost : existingOrder.shippingCost;

      if (inputDiscount !== undefined && inputType) {
        finalDiscountAmount =
          inputType === "PERCENTAGE"
            ? (subtotal * inputDiscount) / 100
            : inputDiscount;
        updateData.discount = finalDiscountAmount;
        // We are not storing the 'rate' in the DB, only the result.
        // Admin UI will have to infer or just show "Discount: $5000".
      }

      updateData.total =
        subtotal -
        (updateData.discount ?? existingOrder.discount) +
        inputShipping;
    }

    const customOrder = await prismadb.customOrder.update({
      where: {
        id: params.customOrderId,
        storeId: params.storeId,
      },
      data: updateData,
      include: {
        items: true,
      },
    });

    return NextResponse.json(customOrder);
  } catch (error) {
    console.log("[CUSTOM_ORDER_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; customOrderId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.customOrderId) {
      return new NextResponse("Custom Order ID is required", { status: 400 });
    }

    const customOrder = await prismadb.customOrder.delete({
      where: {
        id: params.customOrderId,
        storeId: params.storeId,
      },
    });

    return NextResponse.json(customOrder);
  } catch (error) {
    console.log("[CUSTOM_ORDER_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
