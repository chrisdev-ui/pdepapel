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
    const { title, label1, label2, highlight, callToAction, imageUrl } = body;
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
    if (!callToAction) {
      return NextResponse.json(
        { error: "Call to action is required" },
        { status: 400 },
      );
    }

    const mainBanner = await prismadb.mainBanner.create({
      data: {
        title,
        label1,
        label2,
        highlight,
        callToAction,
        imageUrl,
        storeId: params.storeId,
      },
    });
    return NextResponse.json(mainBanner);
  } catch (error) {
    console.log("[MAIN_BANNERS_POST]", error);
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
    const mainBanner = await prismadb.mainBanner.findFirst({
      where: { storeId: params.storeId },
    });
    return NextResponse.json(mainBanner);
  } catch (error) {
    console.log("[MAIN_BANNERS_GET]", error);
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
        { error: "Main Banner ID(s) are required and must be an array" },
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
      const mainBanners = await tx.mainBanner.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
        include: {
          store: true,
        },
      });

      if (mainBanners.length > 0) {
        const publicIds = mainBanners
          .map((mainBanner) =>
            getPublicIdFromCloudinaryUrl(mainBanner.imageUrl),
          )
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
      }

      const deletedMainBanners = await tx.mainBanner.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      return {
        deletedMainBanners,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.log("[MAIN_BANNERS_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
