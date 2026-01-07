import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import cloudinary from "@/lib/cloudinary";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // 1. Fetch ALL active image URLs from database
    const [store, billboards, mainBanner, banners, productImages, shippings] =
      await Promise.all([
        prismadb.store.findUnique({
          where: { id: params.storeId },
          select: { logoUrl: true },
        }),
        prismadb.billboard.findMany({
          where: { storeId: params.storeId },
          select: { imageUrl: true },
        }),
        prismadb.mainBanner.findUnique({
          where: { storeId: params.storeId },
          select: { imageUrl: true },
        }),
        prismadb.banner.findMany({
          where: { storeId: params.storeId },
          select: { imageUrl: true },
        }),
        prismadb.image.findMany({
          where: {
            OR: [
              { product: { storeId: params.storeId } },
              { productGroup: { storeId: params.storeId } },
            ],
          },
          select: { url: true },
        }),
        prismadb.shipping.findMany({
          where: { storeId: params.storeId },
          select: { guideUrl: true, trackingUrl: true },
        }),
      ]);

    // Consolidate active URLs into a Set for fast lookup
    const activeUrls = new Set<string>();

    if (store?.logoUrl) activeUrls.add(store.logoUrl);
    if (mainBanner?.imageUrl) activeUrls.add(mainBanner.imageUrl);
    billboards.forEach((b) => activeUrls.add(b.imageUrl));
    banners.forEach((b) => activeUrls.add(b.imageUrl));
    productImages.forEach((i) => activeUrls.add(i.url));
    shippings.forEach((s) => {
      if (s.guideUrl) activeUrls.add(s.guideUrl);
      if (s.trackingUrl) activeUrls.add(s.trackingUrl);
    });

    // 2. Fetch all assets from Cloudinary
    // Note: Free tier has rate limits. For production with many images, pagination (next_cursor) is needed.
    // We'll fetch up to 500 (default max) for now.
    // Optionally filter by folder if you organize by storeId.
    const cloudinaryResult = await cloudinary.v2.api.resources({
      type: "upload",
      prefix: "", // Add store specific prefix if applicable, e.g. `stores/${params.storeId}`
      max_results: 500,
    });

    const resources = cloudinaryResult.resources as {
      public_id: string;
      secure_url: string;
      created_at: string;
      bytes: number;
      format: string;
      url: string;
    }[];

    // 3. Find Orphans
    // Cloudinary returns 'secure_url' (https) and 'url' (http). We should check both or normalize.
    // DB usually stores the secure_url.
    const orphans = resources.filter((resource) => {
      return (
        !activeUrls.has(resource.secure_url) && !activeUrls.has(resource.url)
      );
    });

    const totalBytes = orphans.reduce((acc, curr) => acc + curr.bytes, 0);

    return NextResponse.json({
      orphans,
      stats: {
        count: orphans.length,
        totalSize: totalBytes, // in bytes
        scannedCount: resources.length,
      },
    });
  } catch (error) {
    console.error("[CLOUDINARY_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();
    const { publicIds } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return new NextResponse("Public IDs are required", { status: 400 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Delete from Cloudinary
    const result = await cloudinary.v2.api.delete_resources(publicIds);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CLOUDINARY_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
