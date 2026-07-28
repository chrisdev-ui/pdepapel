import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-revalidate-secret",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  return handleRevalidation(req);
}

export async function GET(req: NextRequest) {
  return handleRevalidation(req);
}

async function handleRevalidation(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secret =
      req.headers.get("x-revalidate-secret") ||
      searchParams.get("secret") ||
      searchParams.get("token");

    const expectedSecret =
      process.env.REVALIDATION_SECRET || "pdepapel_revalidate_secret_2026";

    if (secret !== expectedSecret) {
      return NextResponse.json(
        { message: "Clave de revalidación inválida" },
        { status: 401, headers: corsHeaders },
      );
    }

    let productId = searchParams.get("productId");
    let path = searchParams.get("path");
    let tag = searchParams.get("tag");

    // Try reading JSON body if available
    try {
      const body = await req.json();
      if (body) {
        if (body.productId) productId = body.productId;
        if (body.path) path = body.path;
        if (body.tag) tag = body.tag;
      }
    } catch {
      // Body reading optional if passed via query params
    }

    const revalidatedPaths: string[] = [];

    // Revalidate specific product path
    if (productId) {
      const productPath = `/product/${productId}`;
      revalidatePath(productPath);
      revalidatedPaths.push(productPath);
    }

    // Revalidate custom path if provided
    if (path) {
      revalidatePath(path);
      revalidatedPaths.push(path);
    }

    // Default global paths affected by stock/variants
    if (!path && !productId) {
      revalidatePath("/shop");
      revalidatePath("/");
      revalidatedPaths.push("/shop", "/");
    } else {
      // Always revalidate /shop when stock/product updates
      revalidatePath("/shop");
      revalidatedPaths.push("/shop");
    }

    // Revalidate tag if provided or fallback to 'products'
    if (tag) {
      revalidateTag(tag);
    }
    revalidateTag("products");

    return NextResponse.json(
      {
        revalidated: true,
        now: Date.now(),
        paths: revalidatedPaths,
      },
      { headers: corsHeaders },
    );
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error al revalidar la página", error: error?.message },
      { status: 500, headers: corsHeaders },
    );
  }
}
