import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  assertWelcomeBenefitEligibility,
  getWelcomeBenefitFilter,
} from "@/lib/customer-benefits";
import { createCorsHeaders } from "@/lib/cors";
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

const getCorsHeaders = (request: Request) =>
  createCorsHeaders(request, { methods: "GET, OPTIONS" });

const getActiveWelcomeBenefit = async (storeId: string) => {
  const coupon = await prismadb.coupon.findFirst({
    where: getWelcomeBenefitFilter(storeId, getColombiaDate()),
    orderBy: { createdAt: "desc" },
  });

  if (
    !coupon ||
    (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses)
  ) {
    return null;
  }

  return coupon;
};

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const coupon = await getActiveWelcomeBenefit(params.storeId);
    if (!coupon) {
      return NextResponse.json(
        { eligible: false, reason: "no_active_benefit" },
        { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
      );
    }

    await assertWelcomeBenefitEligibility({
      coupon,
      storeId: params.storeId,
      userId,
      database: prismadb,
    });

    return NextResponse.json(
      {
        eligible: true,
        coupon: {
          code: coupon.code,
          type: coupon.type,
          amount: coupon.amount,
          minOrderValue: coupon.minOrderValue,
          endDate: coupon.endDate,
        },
      },
      { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
    );
  } catch (error) {
    return handleErrorResponse(error, "WELCOME_BENEFIT_GET", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
