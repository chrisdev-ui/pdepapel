import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const MAX_VIDEO_BYTES = 280 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["mp4", "mov", "mpeg", "avi"]);

function readString(value: unknown, field: string, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw ErrorFactory.InvalidRequest(`El campo ${field} es obligatorio`);
    return null;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw ErrorFactory.InvalidRequest(`El campo ${field} no es válido`);
  }
  return value.trim();
}

function readNumber(value: unknown, field: string, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw ErrorFactory.InvalidRequest(`El campo ${field} es obligatorio`);
    return null;
  }
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw ErrorFactory.InvalidRequest(`El campo ${field} no es válido`);
  }
  return result;
}

function parseVideo(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw ErrorFactory.InvalidRequest("Los datos del video no son válidos");
  }
  const body = value as Record<string, unknown>;
  const url = readString(body.url, "url", true)!;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw ErrorFactory.InvalidRequest("La URL del video no es válida");
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "res.cloudinary.com") {
    throw ErrorFactory.InvalidRequest("El video debe cargarse de forma segura en Cloudinary");
  }
  const format = readString(body.format, "formato", true)!.toLowerCase();
  const durationSeconds = readNumber(body.durationSeconds, "duración", true)!;
  const width = readNumber(body.width, "ancho", true)!;
  const height = readNumber(body.height, "alto", true)!;
  const bytes = readNumber(body.bytes, "tamaño", true)!;
  if (!ACCEPTED_FORMATS.has(format)) {
    throw ErrorFactory.InvalidRequest("Usa un video MP4, MOV, MPEG o AVI");
  }
  if (durationSeconds < 10 || durationSeconds > 61) {
    throw ErrorFactory.InvalidRequest("El video debe durar entre 10 y 61 segundos");
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 360 || height <= width) {
    throw ErrorFactory.InvalidRequest("El video debe ser vertical y tener al menos 360 px de ancho");
  }
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_VIDEO_BYTES) {
    throw ErrorFactory.InvalidRequest("El video no puede superar 280 MB");
  }
  return {
    url,
    cloudinaryId: readString(body.cloudinaryId, "identificador"),
    format,
    durationSeconds,
    width,
    height,
    bytes,
    isPrimary: body.isPrimary !== false,
  };
}

async function verifyProduct(storeId: string, productId: string) {
  const product = await prismadb.product.findFirst({
    where: { id: productId, storeId },
    select: { id: true },
  });
  if (!product) throw ErrorFactory.NotFound("Producto no encontrado");
  return product;
}

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    await verifyProduct(params.storeId, params.productId);
    return NextResponse.json(
      await prismadb.productVideo.findMany({
        where: { productId: params.productId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
      }),
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_VIDEOS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    await verifyProduct(params.storeId, params.productId);
    const video = parseVideo(await request.json());

    const created = await prismadb.$transaction(async (transaction) => {
      if (video.isPrimary) {
        await transaction.productVideo.updateMany({
          where: { productId: params.productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return transaction.productVideo.create({
        data: { productId: params.productId, ...video },
      });
    });
    return NextResponse.json(created, {
      status: 201,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_VIDEOS_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
