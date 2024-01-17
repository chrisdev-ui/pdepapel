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
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const { imageUrl } = await req.json();
    const publicId = getPublicIdFromCloudinaryUrl(imageUrl);
    if (publicId) {
      await cloudinaryInstance.v2.api.delete_resources([publicId], {
        type: "upload",
        resource_type: "image",
      });
    }
    return NextResponse.json(null, { status: 200 });
  } catch (error) {
    console.log("[CLOUDINARY_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
