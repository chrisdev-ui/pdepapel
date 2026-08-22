import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_BATCH_SIZE = 25;

const nameSchema = z
  .string()
  .trim()
  .min(3, "El nombre debe tener al menos 3 caracteres")
  .max(120, "El nombre no puede superar 120 caracteres");

const namingChangeSchema = z.object({
  entityType: z.enum(["PRODUCT", "PRODUCT_GROUP"]),
  entityId: z.string().uuid(),
  name: nameSchema,
});

const applySchema = z.object({
  changes: z.array(namingChangeSchema).min(1).max(MAX_BATCH_SIZE),
});

const rollbackSchema = z.object({
  changeIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH_SIZE),
});

function uniqueTargetKey(change: z.infer<typeof namingChangeSchema>) {
  return `${change.entityType}:${change.entityId}`;
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const payload = applySchema.parse(await req.json());
    const targetKeys = payload.changes.map(uniqueTargetKey);
    if (new Set(targetKeys).size !== targetKeys.length) {
      throw ErrorFactory.InvalidRequest(
        "Cada producto o grupo solo puede aparecer una vez por lote.",
      );
    }

    const productIds = payload.changes
      .filter((change) => change.entityType === "PRODUCT")
      .map((change) => change.entityId);
    const groupIds = payload.changes
      .filter((change) => change.entityType === "PRODUCT_GROUP")
      .map((change) => change.entityId);

    const [products, groups] = await Promise.all([
      productIds.length
        ? prismadb.product.findMany({
            where: { storeId: params.storeId, id: { in: productIds } },
            select: { id: true, name: true, slug: true },
          })
        : [],
      groupIds.length
        ? prismadb.productGroup.findMany({
            where: { storeId: params.storeId, id: { in: groupIds } },
            select: { id: true, name: true, slug: true },
          })
        : [],
    ]);

    if (
      products.length !== productIds.length ||
      groups.length !== groupIds.length
    ) {
      throw ErrorFactory.NotFound(
        "Uno o más productos ya no existen o no pertenecen a esta tienda.",
      );
    }

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const changesToApply = payload.changes.filter((change) => {
      const current =
        change.entityType === "PRODUCT"
          ? productsById.get(change.entityId)
          : groupsById.get(change.entityId);
      return current?.name !== change.name;
    });
    const batchId = randomUUID();

    const appliedChanges = await prismadb.$transaction(async (tx) => {
      const records: Array<{
        id: string;
        entityType: "PRODUCT" | "PRODUCT_GROUP";
        entityId: string;
        previousName: string;
        nextName: string;
      }> = [];

      for (const change of changesToApply) {
        const current =
          change.entityType === "PRODUCT"
            ? productsById.get(change.entityId)
            : groupsById.get(change.entityId);

        if (!current) continue;

        if (change.entityType === "PRODUCT") {
          await tx.product.update({
            where: { id: change.entityId },
            data: { name: change.name },
          });
        } else {
          await tx.productGroup.update({
            where: { id: change.entityId },
            data: { name: change.name },
          });
        }

        const record = await tx.productNamingChange.create({
          data: {
            storeId: params.storeId,
            entityType: change.entityType,
            entityId: change.entityId,
            previousName: current.name,
            nextName: change.name,
            batchId,
            changedBy: userId,
          },
          select: {
            id: true,
            entityType: true,
            entityId: true,
            previousName: true,
            nextName: true,
          },
        });
        records.push(record);
      }

      return records;
    });

    if (appliedChanges.length > 0) {
      await invalidateStoreProductsCache(params.storeId);
    }

    return NextResponse.json({
      batchId,
      appliedChanges,
      skippedCount: payload.changes.length - appliedChanges.length,
      message:
        appliedChanges.length > 0
          ? "Nombres actualizados sin cambiar URLs ni otros datos del producto."
          : "Los nombres seleccionados ya estaban actualizados.",
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_NAMING_POST");
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
    const payload = rollbackSchema.parse(await req.json());

    const changes = await prismadb.productNamingChange.findMany({
      where: {
        storeId: params.storeId,
        id: { in: payload.changeIds },
        revertedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    const restoredChanges = await prismadb.$transaction(async (tx) => {
      const restored: string[] = [];
      const skipped: Array<{ id: string; reason: string }> = [];

      for (const change of changes) {
        const current =
          change.entityType === "PRODUCT"
            ? await tx.product.findFirst({
                where: { id: change.entityId, storeId: params.storeId },
                select: { id: true, name: true },
              })
            : await tx.productGroup.findFirst({
                where: { id: change.entityId, storeId: params.storeId },
                select: { id: true, name: true },
              });

        if (!current) {
          skipped.push({ id: change.id, reason: "El producto ya no existe." });
          continue;
        }
        if (current.name !== change.nextName) {
          skipped.push({
            id: change.id,
            reason: "El nombre cambió después de este lote y no se reemplazó.",
          });
          continue;
        }

        if (change.entityType === "PRODUCT") {
          await tx.product.update({
            where: { id: change.entityId },
            data: { name: change.previousName },
          });
        } else {
          await tx.productGroup.update({
            where: { id: change.entityId },
            data: { name: change.previousName },
          });
        }
        await tx.productNamingChange.update({
          where: { id: change.id },
          data: { revertedAt: new Date(), revertedBy: userId },
        });
        restored.push(change.id);
      }

      return { restored, skipped };
    });

    if (restoredChanges.restored.length > 0) {
      await invalidateStoreProductsCache(params.storeId);
    }

    return NextResponse.json(restoredChanges);
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_NAMING_PATCH");
  }
}
