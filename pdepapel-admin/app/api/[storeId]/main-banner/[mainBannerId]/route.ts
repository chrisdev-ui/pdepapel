import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { mainBannerId: string } },
) {
  if (!params.mainBannerId)
    return NextResponse.json(
      { error: "Banner ID is required" },
      { status: 400 },
    );
  try {
    const mainBanner = await prismadb.mainBanner.findUnique({
      where: { id: params.mainBannerId },
    });
    return NextResponse.json(mainBanner);
  } catch (error) {
    console.log("[MAIN_BANNER_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; mainBannerId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!params.mainBannerId)
    return NextResponse.json(
      { error: "Banner ID is required" },
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
    const mainBannerToUpdate = await prismadb.mainBanner.findUnique({
      where: { id: params.mainBannerId },
    });
    if (!mainBannerToUpdate)
      return NextResponse.json(
        { error: "Main Banner not found" },
        { status: 404 },
      );
    const publicId = getPublicIdFromCloudinaryUrl(mainBannerToUpdate.imageUrl);
    if (publicId)
      await cloudinaryInstance.v2.api.delete_resources([publicId], {
        type: "upload",
        resource_type: "image",
      });
    const updatedMainBanner = await prismadb.mainBanner.update({
      where: { id: params.mainBannerId },
      data: {
        title,
        label1,
        label2,
        highlight,
        callToAction,
        imageUrl,
      },
    });
    return NextResponse.json(updatedMainBanner);
  } catch (error) {
    console.log("[MAIN_BANNER_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; mainBannerId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!params.mainBannerId)
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
    const mainBannerToDelete = await prismadb.mainBanner.findUnique({
      where: { id: params.mainBannerId },
    });
    if (!mainBannerToDelete)
      return NextResponse.json(
        { error: "Main Banner not found" },
        { status: 404 },
      );
    const publicId = getPublicIdFromCloudinaryUrl(mainBannerToDelete.imageUrl);
    if (publicId)
      await cloudinaryInstance.v2.api.delete_resources([publicId], {
        type: "upload",
        resource_type: "image",
      });
    await prismadb.mainBanner.delete({
      where: { id: params.mainBannerId },
    });
    return NextResponse.json(mainBannerToDelete);
  } catch (error) {
    console.log("[MAIN_BANNER_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
