import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { bannerId: string } },
) {
  if (!params.bannerId)
    return NextResponse.json(
      { error: "Banner ID is required" },
      { status: 400 },
    );
  try {
    const banner = await prismadb.banner.findUnique({
      where: { id: params.bannerId },
    });
    return NextResponse.json(banner);
  } catch (error) {
    console.log("[BANNER_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; bannerId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!params.bannerId)
    return NextResponse.json(
      { error: "Banner ID is required" },
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
    if (!callToAction) {
      return NextResponse.json(
        { error: "Call to action is required" },
        { status: 400 },
      );
    }
    const bannerToUpdate = await prismadb.banner.findUnique({
      where: { id: params.bannerId },
    });
    if (!bannerToUpdate)
      return NextResponse.json({ error: "Banner not found" }, { status: 404 });
    const publicId = getPublicIdFromCloudinaryUrl(bannerToUpdate.imageUrl);
    if (publicId && imageUrl !== bannerToUpdate.imageUrl) {
      await cloudinaryInstance.v2.api.delete_resources([publicId], {
        type: "upload",
        resource_type: "image",
      });
    }
    const updatedBanner = await prismadb.banner.updateMany({
      where: { id: params.bannerId },
      data: {
        callToAction,
        imageUrl,
      },
    });
    return NextResponse.json(updatedBanner);
  } catch (error) {
    console.log("[BANNER_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; bannerId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!params.bannerId)
    return NextResponse.json(
      { error: "Banner ID is required" },
      { status: 400 },
    );
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const bannerToDelete = await prismadb.banner.findUnique({
      where: { id: params.bannerId },
    });
    if (!bannerToDelete)
      return NextResponse.json({ error: "Banner not found" }, { status: 404 });
    const publicId = getPublicIdFromCloudinaryUrl(bannerToDelete.imageUrl);
    if (publicId)
      await cloudinaryInstance.v2.api.delete_resources([publicId], {
        type: "upload",
        resource_type: "image",
      });
    const deletedBanner = await prismadb.banner.deleteMany({
      where: { id: params.bannerId },
    });
    return NextResponse.json(deletedBanner);
  } catch (error) {
    console.log("[BANNER_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
