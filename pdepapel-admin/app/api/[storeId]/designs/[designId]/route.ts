import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; designId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.designId)
      throw ErrorFactory.InvalidRequest("El ID del diseño es obligatorio");

    const design = await prismadb.design.findUnique({
      where: { id: params.designId },
    });

    return NextResponse.json(design);
  } catch (error) {
    return handleErrorResponse(error, "DESIGN_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; designId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.designId)
      throw ErrorFactory.InvalidRequest("El ID del diseño es obligatorio");

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const { name } = body;

    if (!name)
      throw ErrorFactory.InvalidRequest("El nombre del diseño es obligatorio");

    const design = await prismadb.$transaction(async (tx) => {
      const design = await tx.design.findUnique({
        where: { id: params.designId, storeId: params.storeId },
      });

      if (!design)
        throw ErrorFactory.InvalidRequest(
          `El diseño ${params.designId} no existe en esta tienda`,
        );

      return tx.design.update({
        where: { id: params.designId, storeId: params.storeId },
        data: {
          name,
        },
      });
    });

    return NextResponse.json(design);
  } catch (error) {
    return handleErrorResponse(error, "DESIGN_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; designId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.designId)
      throw ErrorFactory.InvalidRequest("El ID del diseño es obligatorio");

    await verifyStoreOwner(userId, params.storeId);

    const deletedDesign = await prismadb.$transaction(async (tx) => {
      const design = await tx.design.findUnique({
        where: { id: params.designId, storeId: params.storeId },
      });

      if (!design)
        throw ErrorFactory.InvalidRequest(
          `El diseño ${params.designId} no existe en esta tienda`,
        );

      const products = await tx.product.count({
        where: {
          designId: params.designId,
          storeId: params.storeId,
        },
      });

      if (products > 0)
        throw ErrorFactory.Conflict(
          `No se puede eliminar el diseño ${design.name} porque tiene ${products} productos asociados. Elimina o reasigna los productos asociados primero`,
          {
            design: design.name,
            products,
          },
        );

      return tx.design.delete({
        where: { id: params.designId, storeId: params.storeId },
      });
    });

    return NextResponse.json(deletedDesign);
  } catch (error) {
    return handleErrorResponse(error, "DESIGN_DELETE");
  }
}
