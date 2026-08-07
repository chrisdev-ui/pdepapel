import { auth } from "@clerk/nextjs";
import { FairEventStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import {
  parseReconciliationWorkbook,
  prepareReconciliationPreview,
  type ReconciliationCatalogProduct,
  type ReconciliationPreview,
} from "@/lib/fair-reconciliation-import";
import { recalculateKitStock } from "@/lib/inventory";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACTIVE_FAIR_STATUSES = [
  FairEventStatus.DRAFT,
  FairEventStatus.OPEN,
  FairEventStatus.RECONCILING,
];

type PrismaReader = Pick<
  typeof prismadb,
  "product" | "fairEventInventoryItem" | "inventoryMovement" | "productKit"
>;

async function getCatalogProducts(
  db: PrismaReader,
  storeId: string,
  skus: string[],
): Promise<ReconciliationCatalogProduct[]> {
  const products = await db.product.findMany({
    where: { storeId, sku: { in: skus } },
    select: {
      id: true,
      sku: true,
      name: true,
      stock: true,
      isArchived: true,
      isKit: true,
    },
  });
  const activeFairItems = await db.fairEventInventoryItem.findMany({
    where: {
      productId: { in: products.map((product) => product.id) },
      fairEvent: {
        storeId,
        status: { in: ACTIVE_FAIR_STATUSES },
      },
    },
    select: { productId: true },
  });
  const productIdsWithActiveFair = new Set(
    activeFairItems.map((item) => item.productId),
  );

  return products.map((product) => ({
    ...product,
    hasActiveFairAllocation: productIdsWithActiveFair.has(product.id),
  }));
}

async function getValidatedPreview(
  db: PrismaReader,
  storeId: string,
  fileBuffer: Buffer,
): Promise<ReconciliationPreview> {
  const parsedRows = await parseReconciliationWorkbook(fileBuffer);
  const catalogProducts = await getCatalogProducts(
    db,
    storeId,
    Array.from(new Set(parsedRows.map((row) => row.sku).filter(Boolean))),
  );
  return prepareReconciliationPreview(parsedRows, catalogProducts, storeId);
}

function toResponse(preview: ReconciliationPreview, alreadyApplied: boolean) {
  return {
    rows: preview.rows,
    totalRows: preview.totalRows,
    readyCount: preview.readyCount,
    skippedCount: preview.skippedCount,
    errorCount: preview.errorCount,
    importReference: preview.importReference,
    canApply:
      preview.readyCount > 0 &&
      preview.errorCount === 0 &&
      !alreadyApplied &&
      Boolean(preview.importReference),
    alreadyApplied,
  };
}

async function getUploadedWorkbook(req: Request) {
  const formData = await req.formData();
  const mode = formData.get("mode");
  const file = formData.get("file");

  if (mode !== "preview" && mode !== "apply") {
    throw ErrorFactory.InvalidRequest("Modo de importación inválido.");
  }
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    throw ErrorFactory.InvalidRequest(
      "Selecciona la plantilla de conciliación.",
    );
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw ErrorFactory.InvalidRequest(
      "La plantilla debe ser un archivo Excel .xlsx.",
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw ErrorFactory.InvalidRequest("La plantilla no puede superar 5 MB.");
  }

  return {
    mode,
    fileBuffer: Buffer.from(await file.arrayBuffer()),
  };
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

    const { mode, fileBuffer } = await getUploadedWorkbook(req);
    const preview = await getValidatedPreview(
      prismadb,
      params.storeId,
      fileBuffer,
    );
    const existingImport = preview.importReference
      ? await prismadb.inventoryMovement.findFirst({
          where: {
            storeId: params.storeId,
            referenceId: preview.importReference,
          },
          select: { id: true },
        })
      : null;

    if (mode === "preview") {
      return NextResponse.json(toResponse(preview, Boolean(existingImport)), {
        headers: CACHE_HEADERS.NO_CACHE,
      });
    }

    if (existingImport) {
      throw ErrorFactory.Conflict(
        "Esta plantilla ya fue aplicada. Descarga una nueva antes de continuar.",
      );
    }
    if (preview.errorCount > 0 || preview.readyCount === 0) {
      throw ErrorFactory.InvalidRequest(
        "Corrige todos los errores de la revisión antes de aplicar la conciliación.",
      );
    }

    const appliedPreview = await prismadb.$transaction(async (tx) => {
      const freshPreview = await getValidatedPreview(
        tx,
        params.storeId,
        fileBuffer,
      );
      if (
        freshPreview.errorCount > 0 ||
        freshPreview.readyCount === 0 ||
        !freshPreview.importReference
      ) {
        throw ErrorFactory.Conflict(
          "El inventario cambió desde la revisión. Descarga una plantilla nueva, revisa y vuelve a cargarla.",
        );
      }

      const alreadyApplied = await tx.inventoryMovement.findFirst({
        where: {
          storeId: params.storeId,
          referenceId: freshPreview.importReference,
        },
        select: { id: true },
      });
      if (alreadyApplied) {
        throw ErrorFactory.Conflict(
          "Esta plantilla ya fue aplicada. Descarga una nueva antes de continuar.",
        );
      }

      for (const row of freshPreview.readyRows) {
        if (
          !row.productId ||
          row.expectedStock === null ||
          row.difference === null ||
          !row.movementType
        ) {
          throw ErrorFactory.InvalidRequest("Encontramos una fila incompleta.");
        }

        const updated = await tx.product.updateMany({
          where: {
            id: row.productId,
            storeId: params.storeId,
            stock: row.expectedStock,
          },
          data: { stock: { increment: row.difference } },
        });
        if (updated.count !== 1) {
          throw ErrorFactory.Conflict(
            `El inventario de ${row.productName || row.sku} cambió mientras se aplicaba la conciliación. No se guardó ningún ajuste.`,
          );
        }

        await tx.inventoryMovement.create({
          data: {
            storeId: params.storeId,
            productId: row.productId,
            type: row.movementType,
            quantity: row.difference,
            previousStock: row.expectedStock,
            newStock: row.expectedStock + row.difference,
            reason: row.reason || "Conciliación de feria anterior",
            description: [
              "Ajuste importado desde conciliación de feria anterior.",
              row.description && `Nota: ${row.description}`,
              `Fila de plantilla: ${row.rowNumber}.`,
            ]
              .filter(Boolean)
              .join(" "),
            referenceId: freshPreview.importReference,
            createdBy: `USER_${userId}`,
          },
        });
      }

      const kits = await tx.productKit.findMany({
        where: {
          componentId: {
            in: freshPreview.readyRows
              .map((row) => row.productId)
              .filter((productId): productId is string => Boolean(productId)),
          },
        },
        select: { kitId: true },
      });
      await recalculateKitStock(
        tx,
        Array.from(new Set(kits.map((kit) => kit.kitId))),
      );

      return freshPreview;
    });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(
      {
        appliedCount: appliedPreview.readyCount,
        importReference: appliedPreview.importReference,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "RECONCILIATION_IMPORT_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
