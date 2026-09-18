import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinary from "@/lib/cloudinary";
import {
  collectReferencedPublicIds,
  findOrphanResources,
  findStillReferenced,
} from "@/lib/cloudinary-orphans";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CloudinaryResource = {
  public_id: string;
  secure_url: string;
  created_at: string;
  bytes: number;
  format: string;
  url: string;
};

async function listAllUploads(): Promise<CloudinaryResource[]> {
  const all: CloudinaryResource[] = [];
  let nextCursor: string | undefined;
  do {
    const page: { resources?: CloudinaryResource[]; next_cursor?: string } =
      await cloudinary.v2.api.resources({
        type: "upload",
        max_results: 500,
        next_cursor: nextCursor,
      });
    all.push(...(page.resources ?? []));
    nextCursor = page.next_cursor;
  } while (nextCursor);
  return all;
}

/**
 * Huérfanos: archivos de Cloudinary que ninguna fila de la base referencia.
 * Las referencias se recogen de todas las tablas que guardan una URL (fotos
 * de productos y grupos, historial de pedidos, videos, portadas, inicio,
 * logo, guías, descripciones), no solo de las fotos de productos: antes las
 * fotos que solo conservaba un pedido salían como huérfanas.
 */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const [referenced, resources] = await Promise.all([
      collectReferencedPublicIds(prismadb),
      listAllUploads(),
    ]);
    const orphans = findOrphanResources(resources, referenced);
    const totalBytes = orphans.reduce((acc, curr) => acc + curr.bytes, 0);

    return NextResponse.json(
      {
        orphans,
        stats: {
          count: orphans.length,
          totalSize: totalBytes,
          scannedCount: resources.length,
          referencedCount: referenced.size,
        },
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "CLOUDINARY_ORPHANS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

/**
 * Borra solo lo que sigue siendo huérfano en el momento de borrar. La lista
 * del cuerpo es una sugerencia del cliente, no una orden: cada id se vuelve
 * a comprobar contra la base antes de tocar Cloudinary.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json().catch(() => ({}));
    const publicIds: unknown = body?.publicIds;
    if (
      !Array.isArray(publicIds) ||
      publicIds.length === 0 ||
      !publicIds.every((id) => typeof id === "string" && id.trim())
    ) {
      throw ErrorFactory.InvalidRequest("Indica los archivos a borrar");
    }
    const requested = Array.from(new Set(publicIds as string[]));

    const referenced = await collectReferencedPublicIds(prismadb);
    const stillReferenced = findStillReferenced(requested, referenced);
    if (stillReferenced.length > 0) {
      throw ErrorFactory.Conflict(
        `${stillReferenced.length} ${stillReferenced.length === 1 ? "archivo sigue en uso" : "archivos siguen en uso"} y no se borra: ${stillReferenced
          .slice(0, 5)
          .map((entry) => `${entry.publicId} (${entry.sources.join(", ")})`)
          .join("; ")}${stillReferenced.length > 5 ? "…" : ""}. Vuelve a revisar la lista.`,
        { publicIds: stillReferenced.map((entry) => entry.publicId).join(", ") },
      );
    }

    const result = await cloudinary.v2.api.delete_resources(requested, {
      type: "upload",
      resource_type: "image",
    });

    return NextResponse.json(
      { deleted: requested.length, result },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "CLOUDINARY_ORPHANS_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
