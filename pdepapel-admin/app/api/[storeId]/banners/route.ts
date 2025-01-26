import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function POST(
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
    const { callToAction, imageUrl } = body;
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!imageUrl)
      return NextResponse.json(
        { error: "Image URL is required" },
        { status: 400 },
      );
    if (!callToAction)
      return NextResponse.json(
        { error: "Call to action is required" },
        { status: 400 },
      );

    const banner = await prismadb.banner.create({
      data: {
        callToAction,
        imageUrl,
        storeId: params.storeId,
      },
    });
    return NextResponse.json(banner);
  } catch (error) {
    console.log("[BANNERS_POST]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400 },
    );
  try {
    const banners = await prismadb.banner.findMany({
      where: { storeId: params.storeId },
    });
    return NextResponse.json(banners);
  } catch (error) {
    console.log("[BANNERS_GET]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Banner ID(s) are required and must be an array" },
        { status: 400 },
      );
    }

    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await prismadb.$transaction(async (tx) => {
      const banners = await tx.banner.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      const publicIds = banners
        .map((banner) => getPublicIdFromCloudinaryUrl(banner.imageUrl))
        .filter((id): id is string => id !== null && id !== undefined);

      if (publicIds.length > 0) {
        try {
          await cloudinaryInstance.v2.api.delete_resources(publicIds, {
            type: "upload",
            resource_type: "image",
          });
        } catch (cloudinaryError: any) {
          throw new Error(
            `Cloudinary deletion failed: ${cloudinaryError.message}`,
          );
        }
      }

      const deletedBanners = await tx.banner.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      return {
        deletedBanners,
        deletedImages: publicIds,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.log("[BANNERS_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
