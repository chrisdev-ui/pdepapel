import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { productPath, STOREFRONT_ROUTES } from "@/lib/routes";

export async function POST(req: NextRequest) {
  return handleRevalidation(req);
}

async function handleRevalidation(req: NextRequest) {
  try {
    const secret = req.headers.get("x-revalidate-secret");
    const expectedSecret = process.env.REVALIDATION_SECRET?.trim();

    if (!expectedSecret) {
      return NextResponse.json(
        { message: "La revalidación no está configurada" },
        { status: 503 },
      );
    }

    if (secret !== expectedSecret) {
      return NextResponse.json(
        { message: "Clave de revalidación inválida" },
        { status: 401 },
      );
    }

    const parsedBody = await req.json().catch(() => ({}));
    const body =
      parsedBody && typeof parsedBody === "object"
        ? parsedBody
        : ({} as Record<string, unknown>);
    const productId = typeof body.productId === "string" ? body.productId : "";
    const additionalPaths = Array.isArray(body.paths) ? body.paths : [];
    const requestedPaths = [body.path, ...additionalPaths].filter(
      (path): path is string =>
        typeof path === "string" &&
        path.startsWith("/") &&
        !path.startsWith("//"),
    );
    const additionalTags = Array.isArray(body.tags) ? body.tags : [];
    const tags = [body.tag, ...additionalTags].filter(
      (tag): tag is string => typeof tag === "string" && tag.length > 0,
    );

    const revalidatedPaths: string[] = [];
    const paths = Array.from(new Set(requestedPaths)).slice(0, 20);

    // Revalidate specific product path
    if (productId) {
      const productUrl = productPath(productId);
      revalidatePath(productUrl);
      revalidatedPaths.push(productUrl);
    }

    paths.forEach((path) => {
      revalidatePath(path);
      revalidatedPaths.push(path);
    });

    // Default global paths affected by stock/variants
    if (paths.length === 0 && !productId) {
      revalidatePath(STOREFRONT_ROUTES.shop);
      revalidatePath("/");
      revalidatedPaths.push(STOREFRONT_ROUTES.shop, "/");
    } else {
      // Always revalidate /shop when stock/product updates
      revalidatePath(STOREFRONT_ROUTES.shop);
      revalidatedPaths.push(STOREFRONT_ROUTES.shop);
    }

    Array.from(new Set([...tags, "products", "catalog"])).forEach((tag) =>
      revalidateTag(tag),
    );

    return NextResponse.json({
      revalidated: true,
      now: Date.now(),
      paths: revalidatedPaths,
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error al revalidar la página", error: error?.message },
      { status: 500 },
    );
  }
}
