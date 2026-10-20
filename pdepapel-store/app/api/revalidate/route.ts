import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { cachedListingPath, productPath, STOREFRONT_ROUTES } from "@/lib/routes";

/**
 * `version: 2` purga exactamente las etiquetas y rutas que manda el panel.
 * Sin versión se conserva la purga completa de antes, para un panel viejo
 * durante el despliegue.
 */
const SCOPED_VERSION = 2;
const MAX_TAGS = 200;
const MAX_PATHS = 50;
const ALLOWED_TAG =
  /^(products|catalog|catalog-options|categories|home-content|posts|reviews|storefront-settings|newsletter-issues|products:list|products:featured|product:[^\s/]{1,200}|products:(group|category|type):[^\s/]{1,200}|brands|brand:[^\s/]{1,200}|capsules)$/;

export async function POST(req: NextRequest) {
  return handleRevalidation(req);
}

const isSafePath = (path: unknown): path is string =>
  typeof path === "string" && path.startsWith("/") && !path.startsWith("//");

function revalidateWithCachedTwin(path: string, revalidated: string[]) {
  revalidatePath(path);
  revalidated.push(path);
  const cached = cachedListingPath(path);
  if (cached) {
    revalidatePath(cached);
    revalidated.push(cached);
  }
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
    const additionalPaths = Array.isArray(body.paths) ? body.paths : [];
    const requestedPaths = [body.path, ...additionalPaths].filter(isSafePath);
    const additionalTags = Array.isArray(body.tags) ? body.tags : [];
    const tags = [body.tag, ...additionalTags].filter(
      (tag): tag is string => typeof tag === "string" && tag.length > 0,
    );

    if (body.version === SCOPED_VERSION) {
      const scopedTags = Array.from(new Set(tags));
      const rejected = scopedTags.filter((tag) => !ALLOWED_TAG.test(tag));
      if (rejected.length > 0 || scopedTags.length > MAX_TAGS) {
        return NextResponse.json(
          { message: "Etiquetas de revalidación inválidas", rejected: rejected.slice(0, 10) },
          { status: 400 },
        );
      }
      const scopedPaths = Array.from(new Set(requestedPaths));
      if (scopedPaths.length > MAX_PATHS) {
        return NextResponse.json({ message: "Demasiadas rutas para revalidar" }, { status: 400 });
      }
      const revalidatedPaths: string[] = [];
      scopedPaths.forEach((path) => revalidateWithCachedTwin(path, revalidatedPaths));
      scopedTags.forEach((tag) => revalidateTag(tag));
      return NextResponse.json({
        revalidated: true,
        now: Date.now(),
        paths: revalidatedPaths,
        tags: scopedTags,
      });
    }

    const productId = typeof body.productId === "string" ? body.productId : "";
    const revalidatedPaths: string[] = [];
    const paths = Array.from(new Set(requestedPaths)).slice(0, 20);

    if (productId) {
      const productUrl = productPath(productId);
      revalidatePath(productUrl);
      revalidatedPaths.push(productUrl);
    }

    paths.forEach((path) => revalidateWithCachedTwin(path, revalidatedPaths));

    if (paths.length === 0 && !productId) {
      revalidateWithCachedTwin(STOREFRONT_ROUTES.shop, revalidatedPaths);
      revalidatePath("/");
      revalidatedPaths.push("/");
    } else {
      revalidateWithCachedTwin(STOREFRONT_ROUTES.shop, revalidatedPaths);
    }

    Array.from(new Set([...tags, "products", "catalog"])).forEach((tag) =>
      revalidateTag(tag),
    );

    return NextResponse.json({
      revalidated: true,
      now: Date.now(),
      paths: Array.from(new Set(revalidatedPaths)),
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error al revalidar la página", error: error?.message },
      { status: 500 },
    );
  }
}
