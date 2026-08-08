import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function DELETE(
  _request: Request,
  { params }: { params: { storeId: string; productId: string; videoId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const video = await prismadb.productVideo.findFirst({
      where: {
        id: params.videoId,
        productId: params.productId,
        product: { storeId: params.storeId },
      },
      select: { id: true, cloudinaryId: true },
    });
    if (!video) throw ErrorFactory.NotFound("Video no encontrado");

    if (video.cloudinaryId) {
      await cloudinaryInstance.v2.uploader.destroy(video.cloudinaryId, {
        resource_type: "video",
        invalidate: true,
      });
    }
    await prismadb.productVideo.delete({ where: { id: video.id } });
    return NextResponse.json(null, {
      status: 204,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_VIDEO_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
