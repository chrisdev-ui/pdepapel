import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { generateOrderNumber } from "@/lib/utils";
import crypto from "crypto";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const phone = searchParams.get("phone");

    const where: any = {
      storeId: params.storeId,
    };

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    if (phone) {
      where.customerPhone = {
        contains: phone,
      };
    }

    const customOrders = await prismadb.customOrder.findMany({
      where,
      include: {
        items: true,
        quotation: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(customOrders);
  } catch (error) {
    console.log("[CUSTOM_ORDERS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const {
      customerName,
      customerPhone,
      customerEmail,
      type,
      quotationId,
      items,
      discount,
      discountType,
      shippingCost,
      notes,
      adminNotes,
      validUntil,
    } = body;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!customerName || !customerPhone) {
      return new NextResponse("Customer name and phone are required", {
        status: 400,
      });
    }

    if (!items || !items.length) {
      return new NextResponse("Items are required", { status: 400 });
    }

    const orderNumber = "ORD-" + Date.now(); // Fallback if util fails or just use util
    // Actually better to use the util I confirmed:
    const finalOrderNumber = generateOrderNumber();
    const token = crypto.randomUUID();

    let subtotal = 0;
    // Calculate subtotal from items to ensure backend integrity
    items.forEach((item: any) => {
      subtotal += Number(item.quantity) * Number(item.unitPrice);
    });

    let discountAmount = 0;
    if (discount && discountType) {
      discountAmount =
        discountType === "PERCENTAGE" ? (subtotal * discount) / 100 : discount;
    }

    // Recalculate total
    const total = subtotal - discountAmount + (shippingCost || 0);

    const customOrder = await prismadb.customOrder.create({
      data: {
        storeId: params.storeId,
        orderNumber: finalOrderNumber,
        token,
        customerName,
        customerPhone,
        customerEmail,
        type: type || "CUSTOM",
        quotationId,
        subtotal,
        discount: discountAmount,
        discountType,
        shippingCost: shippingCost || 0,
        total,
        notes,
        adminNotes,
        validUntil: validUntil ? new Date(validUntil) : null,
        createdBy: userId,
        items: {
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
            // supplierInfo: item.supplierInfo,
            // supplierUrl: item.supplierUrl,
            category: item.category,
            position: index,
            customNotes: item.customNotes,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    // Update quotation count if used
    if (quotationId) {
      await prismadb.quotation
        .update({
          where: { id: quotationId },
          data: {
            usageCount: {
              increment: 1,
            },
          },
        })
        .catch((err) => console.error("Failed to update quotation usage", err));
    }

    return NextResponse.json(customOrder);
  } catch (error) {
    console.log("[CUSTOM_ORDERS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
