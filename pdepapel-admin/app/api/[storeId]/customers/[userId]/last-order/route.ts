import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; userId: string } },
) {
  try {
    if (!params.userId) {
      return new NextResponse("User ID is required", { status: 400 });
    }

    // If userId looks like an email, assume it's a guest or manual email lookup
    const isEmail = params.userId.includes("@");
    const isGuestPhone = params.userId.startsWith("guest_");

    let whereClause: any = { storeId: params.storeId };

    if (isGuestPhone) {
      const phone = params.userId.replace("guest_", "");
      whereClause.phone = phone;
    } else if (isEmail) {
      whereClause.OR = [
        { email: params.userId }, // direct email match
        { userId: params.userId }, // fallback if some user has email as ID
      ];
    } else {
      whereClause.userId = params.userId;
    }

    const lastOrder = await prismadb.order.findFirst({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        phone: true,
        email: true,
        address: true,
        city: true,
        department: true,
        daneCode: true,
        neighborhood: true,
        addressReference: true,
        address2: true,
        company: true,
        fullName: true,
        documentId: true,
      },
    });

    return NextResponse.json(lastOrder || {});
  } catch (error) {
    console.log("[LAST_ORDER_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
