import { CapsuleSlipKind } from "@prisma/client";

import { AppError, ErrorFactory } from "@/lib/api-errors";
import { checkPoolMargins, type PoolLine } from "@/lib/capsule-pool";
import { printCapsuleSlips } from "@/lib/capsule-slips";
import prismadb from "@/lib/prismadb";

/**
 * Imprimir desde el panel: los papeles pasan antes por la revisión de margen
 * (bolsa impresa + esta impresión, contra los packs guardados); los regalos
 * no, su tope ya lo pone cada pack. Devuelve lo necesario para la hoja de
 * etiquetas: el código del QR y el nombre del producto que dice el papel.
 */
export async function printFromPanel({ storeId, editionId, kind, items, userId }: { storeId: string; editionId: string; kind: unknown; items: PoolLine[]; userId: string }) {
  if (kind !== CapsuleSlipKind.SLIP && kind !== CapsuleSlipKind.GIFT) throw ErrorFactory.InvalidRequest("Elige si imprimes papeles o regalos");
  if (kind === CapsuleSlipKind.SLIP) {
    const check = await checkPoolMargins({ storeId, editionId, proposed: items });
    if (check.minMarginPct === null) throw ErrorFactory.InvalidRequest("Configura el margen mínimo de la tienda en Configuración antes de imprimir");
    if (!check.ok) throw new AppError(`Con esta impresión algún pack queda por debajo del margen mínimo de ${check.minMarginPct} %`, 409, { check });
  }
  const printed = await printCapsuleSlips({ storeId, editionId, kind, items, userId });
  const slips = await prismadb.capsuleSlip.findMany({
    where: { batchId: printed.batchId },
    select: { id: true, code: true, kind: true, product: { select: { name: true, sku: true } } },
    orderBy: { code: "asc" },
  });
  return { batchId: printed.batchId, printed: printed.printed, slips: slips.map((slip) => ({ id: slip.id, code: slip.code, kind: slip.kind, productName: slip.product.name, sku: slip.product.sku })) };
}
