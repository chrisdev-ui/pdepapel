import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { generateOrderNumber } from "@/lib/utils";
import crypto from "crypto";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; quotationId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const { customerName, customerPhone, customerEmail, adjustedItems, notes } =
      body;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.quotationId) {
      return new NextResponse("Quotation ID is required", { status: 400 });
    }

    const quotation = await prismadb.quotation.findUnique({
      where: {
        id: params.quotationId,
        storeId: params.storeId,
      },
      include: {
        items: true,
      },
    });

    if (!quotation) {
      return new NextResponse("Quotation not found", { status: 404 });
    }

    // Determine items to use
    // If 'adjustedItems' is passed, we use those, otherwise we take all items from quotation
    // adjustedItems should be in the format of { ...item, quantity: X }
    const sourceItems = adjustedItems || quotation.items;

    // Calculate totals
    let subtotal = 0;
    sourceItems.forEach((item: any) => {
      subtotal += Number(item.quantity) * Number(item.unitPrice);
    });

    let discountAmount = 0;
    if (quotation.defaultDiscount && quotation.defaultDiscountType) {
      discountAmount =
        quotation.defaultDiscountType === "PERCENTAGE"
          ? (subtotal * quotation.defaultDiscount) / 100
          : quotation.defaultDiscount;
    }

    const total = subtotal - discountAmount;

    // Validity
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + quotation.validityDays);

    const orderNumber = generateOrderNumber();
    const token = crypto.randomUUID();

    const customOrder = await prismadb.customOrder.create({
      data: {
        storeId: params.storeId,
        quotationId: quotation.id,
        orderNumber,
        token,
        customerName,
        customerPhone,
        customerEmail,
        type: quotation.type === "SCHOOL_LIST" ? "SCHOOL_LIST" : "QUOTATION",
        subtotal,
        discount: discountAmount,
        discountType: quotation.defaultDiscountType,
        total,
        notes: notes || quotation.termsConditions,
        validUntil,
        createdBy: userId,
        items: {
          create: sourceItems.map((item: any, index: number) => ({
            productId: item.productId || null,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: Number(item.quantity) * Number(item.unitPrice),
            imageUrl: item.imageUrl,
            category: item.category,
            position: index,
            isExternal: !item.productId, // If it doesn't have a product ID, it's external (from quote logic)
          })),
        },
      },
      include: {
        items: true,
      },
    });

    // Increment usage
    await prismadb.quotation.update({
      where: { id: params.quotationId },
      data: { usageCount: { increment: 1 } },
    });

    return NextResponse.json(customOrder);
  } catch (error) {
    console.log("[QUOTATION_USE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
