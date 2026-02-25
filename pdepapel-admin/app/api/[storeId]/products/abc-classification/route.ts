import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { getProductProfitRanking } from "@/actions/get-product-profitability";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Verify store ownership
    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Get product profitability for the last 180 days (or 365 days)
    // We pass a high limit to get all active products with sales
    const ranking = await getProductProfitRanking(params.storeId, 180, 50000);

    // Calculate total profit across all ranked items
    const totalProfitAllItems = ranking.reduce(
      (acc, curr) => acc + Math.max(0, curr.totalProfit),
      0,
    );

    const aProductIds: string[] = [];
    const bProductIds: string[] = [];
    const cProductIds: string[] = [];

    let cumulativeProfit = 0;

    for (const item of ranking) {
      // Ignore items with negative or zero profit in the ABC sum, but classify them
      if (item.totalProfit <= 0) {
        cProductIds.push(item.productId);
        continue;
      }

      cumulativeProfit += item.totalProfit;
      const profitPercentage = (cumulativeProfit / totalProfitAllItems) * 100;

      // Class A: Items that make up the top 80% of profits
      if (profitPercentage <= 80) {
        aProductIds.push(item.productId);
      }
      // Class B: Items that make up the next 15% of profits (80% to 95%)
      else if (profitPercentage <= 95) {
        bProductIds.push(item.productId);
      }
      // Class C: Bottom 5% of profits
      else {
        cProductIds.push(item.productId);
      }
    }

    // Execute updates in a transaction for safety
    await prismadb.$transaction(async (tx) => {
      // 1. Update A Items
      if (aProductIds.length > 0) {
        await tx.product.updateMany({
          where: { storeId: params.storeId, id: { in: aProductIds } },
          data: { abcClassification: "A" },
        });
      }

      // 2. Update B Items
      if (bProductIds.length > 0) {
        await tx.product.updateMany({
          where: { storeId: params.storeId, id: { in: bProductIds } },
          data: { abcClassification: "B" },
        });
      }

      // 3. Update C Items (or items with 0 sales)
      // Anyone NOT in A or B is automatically C
      const notInAOrB = [...aProductIds, ...bProductIds];
      await tx.product.updateMany({
        where: {
          storeId: params.storeId,
          id: { notIn: notInAOrB },
        },
        data: { abcClassification: "C" },
      });
    });

    return NextResponse.json({
      success: true,
      message: "ABC Classification updated successfully",
      stats: {
        totalClassA: aProductIds.length,
        totalClassB: bProductIds.length,
        totalClassC: cProductIds.length, // Only the ones with sales that hit C. The rest are updated implicitly
      },
    });
  } catch (error) {
    console.error("[ABC_CLASSIFICATION_POST]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
