import { createCorsHeaders } from "@/lib/cors";
import { getWelcomeBenefitFilter } from "@/lib/customer-benefits";
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { NextResponse } from "next/server";

const getCorsHeaders = (request: Request) =>
  createCorsHeaders(request, { methods: "GET, OPTIONS" });

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const coupon = await prismadb.coupon.findFirst({
    where: getWelcomeBenefitFilter(params.storeId, getColombiaDate()),
    select: { type: true, amount: true, minOrderValue: true, maxUses: true, usedCount: true },
    orderBy: { createdAt: "desc" },
  });
  const active = Boolean(
    coupon && (coupon.maxUses === null || coupon.usedCount < coupon.maxUses),
  );

  return NextResponse.json(
    active
      ? {
          active: true,
          type: coupon?.type,
          amount: coupon?.amount,
          minOrderValue: coupon?.minOrderValue,
        }
      : { active: false },
    { headers: { ...getCorsHeaders(req), ...CACHE_HEADERS.NO_CACHE } },
  );
}
