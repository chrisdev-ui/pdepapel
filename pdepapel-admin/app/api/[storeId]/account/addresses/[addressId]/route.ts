import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

const getCorsHeaders = (request: Request) =>
  createCorsHeaders(request, { methods: "DELETE, OPTIONS" });

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; addressId: string } },
) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.addressId) {
      throw ErrorFactory.InvalidRequest("Se requiere la dirección a eliminar");
    }

    const result = await prismadb.customerAddress.deleteMany({
      where: {
        id: params.addressId,
        storeId: params.storeId,
        userId,
      },
    });

    if (result.count === 0) {
      throw ErrorFactory.NotFound("La dirección guardada no existe");
    }

    return NextResponse.json(
      { deleted: true },
      { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
    );
  } catch (error) {
    return handleErrorResponse(error, "CUSTOMER_ADDRESS_DELETE", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
