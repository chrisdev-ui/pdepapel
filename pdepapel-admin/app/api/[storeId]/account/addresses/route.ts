import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
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
  const corsHeaders = getCorsHeaders(req);

  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const addresses = await prismadb.customerAddress.findMany({
      where: { storeId: params.storeId, userId },
      select: {
        id: true,
        label: true,
        fullName: true,
        phone: true,
        documentId: true,
        address: true,
        address2: true,
        city: true,
        department: true,
        daneCode: true,
        neighborhood: true,
        addressReference: true,
        company: true,
        isDefault: true,
        lastUsedAt: true,
      },
      orderBy: [
        { isDefault: "desc" },
        { lastUsedAt: "desc" },
        { updatedAt: "desc" },
      ],
    });

    return NextResponse.json(
      { addresses },
      { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
    );
  } catch (error) {
    return handleErrorResponse(error, "CUSTOMER_ADDRESSES_GET", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
