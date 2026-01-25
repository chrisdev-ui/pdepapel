import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; quotationId: string } },
) {
  try {
    const { userId } = auth();

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

    return NextResponse.json(quotation);
  } catch (error) {
    console.log("[QUOTATION_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; quotationId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const {
      name,
      description,
      type,
      isTemplate,
      isActive,
      validityDays,
      termsConditions,
      items,
      defaultDiscount,
      defaultDiscountType,
    } = body;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.quotationId) {
      return new NextResponse("Quotation ID is required", { status: 400 });
    }

    // Check if updating items
    if (items && items.length > 0) {
      await prismadb.quotationItem.deleteMany({
        where: { quotationId: params.quotationId },
      });
    }

    const updateData: any = {
      name,
      description,
      type,
      isTemplate,
      isActive,
      validityDays,
      termsConditions,
      defaultDiscount,
      defaultDiscountType,
    };

    if (items && items.length > 0) {
      updateData.items = {
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
      };
    }

    const quotation = await prismadb.quotation.update({
      where: {
        id: params.quotationId,
        storeId: params.storeId,
      },
      data: updateData,
      include: {
        items: true,
      },
    });

    return NextResponse.json(quotation);
  } catch (error) {
    console.log("[QUOTATION_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; quotationId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.quotationId) {
      return new NextResponse("Quotation ID is required", { status: 400 });
    }

    const quotation = await prismadb.quotation.delete({
      where: {
        id: params.quotationId,
        storeId: params.storeId,
      },
    });

    return NextResponse.json(quotation);
  } catch (error) {
    console.log("[QUOTATION_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
