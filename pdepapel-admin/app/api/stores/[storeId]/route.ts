import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  getPublicIdFromCloudinaryUrl,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

// Enable Edge Runtime for faster response times
export const runtime = "edge";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const store = await prismadb.store.findUnique({
      where: {
        id: params.storeId,
        userId,
      },
    });

    return NextResponse.json(store, {
      headers: CACHE_HEADERS.STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "STORE_GET", {
      headers: CACHE_HEADERS.STATIC,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const {
      name,
      logoUrl,
      phone,
      email,
      address,
      instagram,
      facebook,
      tiktok,
      twitter,
      youtube,
      pinterest,
      policies,
    } = body;

    if (!name?.trim()) {
      throw ErrorFactory.InvalidRequest("El nombre de la tienda es requerido");
    }

    const existingStore = await prismadb.store.findUnique({
      where: {
        id: params.storeId,
        userId,
      },
    });

    if (!existingStore) {
      throw ErrorFactory.NotFound("Tienda no encontrada o no tiene permisos");
    }

    if (logoUrl) {
      if (existingStore?.logoUrl && existingStore.logoUrl !== logoUrl) {
        const publicId = getPublicIdFromCloudinaryUrl(existingStore.logoUrl);
        if (publicId) {
          try {
            await cloudinaryInstance.v2.uploader.destroy(publicId);
          } catch (error) {
            throw ErrorFactory.CloudinaryError(
              error,
              "Ha ocurrido un error intentando eliminar la imagen de la tienda",
            );
          }
        }
      }
    }

    const duplicateStore = await prismadb.store.findFirst({
      where: {
        userId,
        name: name.trim(),
        NOT: {
          id: params.storeId,
        },
      },
    });

    if (duplicateStore) {
      throw ErrorFactory.Conflict("Ya tienes otra tienda con este nombre");
    }

    const updatedStore = await prismadb.store.update({
      where: {
        id: params.storeId,
        userId,
      },
      data: {
        name: name.trim(),
        logoUrl,
        phone,
        email,
        address,
        instagram,
        tiktok,
        youtube,
        twitter,
        pinterest,
        facebook,
        policies: policies ? JSON.stringify(policies) : {},
      },
    });

    return NextResponse.json(updatedStore, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "STORE_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const store = await prismadb.store.findUnique({
      where: {
        id: params.storeId,
        userId,
      },
      include: {
        _count: {
          select: {
            payments: true,
            shippings: true,
            products: true,
            orders: true,
            reviews: true,
            suppliers: true,
          },
        },
      },
    });

    if (!store) {
      throw ErrorFactory.NotFound("Tienda no encontrada o no tiene permisos");
    }

    const activeContent = {
      products: store._count.products,
      orders: store._count.orders,
      payments: store._count.payments,
      shippings: store._count.shippings,
      reviews: store._count.reviews,
      suppliers: store._count.suppliers,
    };

    const hasActiveContent = Object.values(activeContent).some(
      (count) => count > 0,
    );

    if (hasActiveContent) {
      throw ErrorFactory.Conflict(
        "No se puede eliminar una tienda con contenido activo",
        activeContent,
      );
    }

    await prismadb.$transaction(async (tx) => {
      const where = {
        where: {
          storeId: params.storeId,
        },
      };

      await tx.mainBanner.deleteMany(where);
      await tx.banner.deleteMany(where);
      await tx.billboard.deleteMany(where);
      await tx.post.deleteMany(where);
      await tx.review.deleteMany(where);
      await tx.paymentDetails.deleteMany(where);
      await tx.shipping.deleteMany(where);
      await tx.order.deleteMany(where);
      await tx.product.deleteMany(where);
      await tx.supplier.deleteMany(where);
      await tx.category.deleteMany(where);
      await tx.type.deleteMany(where);
      await tx.size.deleteMany(where);
      await tx.color.deleteMany(where);
      await tx.design.deleteMany(where);

      await tx.store.delete({
        where: {
          id: params.storeId,
        },
      });
    });

    return NextResponse.json("Tu tienda ha sido eliminada correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "STORE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
