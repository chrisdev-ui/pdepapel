import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";

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
    const isTemplate = searchParams.get("isTemplate");
    const isActive = searchParams.get("isActive");
    const type = searchParams.get("type");

    const where: any = {
      storeId: params.storeId,
    };

    if (isTemplate) {
      where.isTemplate = isTemplate === "true";
    }

    if (isActive) {
      where.isActive = isActive === "true";
    }

    if (type) {
      where.type = type;
    }

    const quotations = await prismadb.quotation.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(quotations);
  } catch (error) {
    console.log("[QUOTATIONS_GET]", error);
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
      name,
      description,
      type,
      isTemplate,
      validityDays,
      termsConditions,
      items,
      defaultDiscount,
      defaultDiscountType,
    } = body;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!items || !items.length) {
      return new NextResponse("Items are required", { status: 400 });
    }

    const quotation = await prismadb.quotation.create({
      data: {
        storeId: params.storeId,
        name,
        description,
        type: type || "GENERAL",
        isTemplate: isTemplate || false,
        validityDays: validityDays || 7,
        termsConditions,
        defaultDiscount: defaultDiscount || 0,
        defaultDiscountType,
        createdBy: userId,
        items: {
          create: items.map((item: any, index: number) => ({
            productId: item.productId || null,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            isOptional: item.isOptional || false,
            category: item.category,
            position: index,
            imageUrl: item.imageUrl,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json(quotation);
  } catch (error) {
    console.log("[QUOTATIONS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
