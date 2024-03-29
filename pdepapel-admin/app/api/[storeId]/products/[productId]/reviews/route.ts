import prismadb from "@/lib/prismadb";
import { clerkClient } from "@clerk/nextjs";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400, headers: corsHeaders },
    );
  if (!params.productId)
    return NextResponse.json(
      { error: "Product ID is required" },
      { status: 400, headers: corsHeaders },
    );
  try {
    const body = await req.json();
    const { rating, comment, userId } = body;
    const user = await clerkClient.users.getUser(userId);
    if (!user)
      return NextResponse.json(
        { error: "Unauthenticated" },
        { status: 401, headers: corsHeaders },
      );
    if (!rating)
      return NextResponse.json(
        { error: "Rating is required" },
        { status: 400, headers: corsHeaders },
      );
    const review = await prismadb.review.create({
      data: {
        userId,
        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`,
        storeId: params.storeId,
        productId: params.productId,
        rating,
        comment: comment ?? "",
      },
    });
    return NextResponse.json(review, { status: 200, headers: corsHeaders });
  } catch (error) {
    console.log("[REVIEWS_POST]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400 },
    );
  try {
    const reviews = await prismadb.review.findMany({
      where: { storeId: params.storeId, productId: params.productId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(reviews);
  } catch (error) {
    console.log("[REVIEWS_GET]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
