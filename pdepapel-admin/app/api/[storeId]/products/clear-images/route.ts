import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400 },
    );

  try {
    const body = await req.json();
    const { ids }: { ids: string[] } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return NextResponse.json(
        { error: "Product ID(s) are required and must be an array" },
        { status: 400 },
      );

    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const result = await prismadb.$transaction(async (tx) => {
      const images = await tx.image.findMany({
        where: {
          productId: {
            in: ids,
          },
        },
      });

      const publicIds = images
        .map((image) => getPublicIdFromCloudinaryUrl(image.url))
        .filter((id): id is string => id !== null);

      if (publicIds.length > 0) {
        await cloudinaryInstance.v2.api.delete_resources(publicIds, {
          type: "upload",
          resource_type: "image",
        });
      }

      return await tx.image.deleteMany({
        where: {
          productId: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    console.log("[PRODUCTS_CLEAR_IMAGES_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
