import { CapsuleEditionStatus } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { bogotaDate, capsuleDayStatus } from "@/lib/capsule-day";
import prismadb from "@/lib/prismadb";

/**
 * Los cupos de hoy de la tienda (una sola edición a la venta, así que su tope
 * es el de la tienda) y el cambio de tope de un día, que hace la dueña cuando
 * quiere abrir más pedidos hoy (o menos). Sin edición a la venta, null.
 */
export async function liveDayStatus(storeId: string, now: Date = new Date()) {
  const edition = await prismadb.capsuleEdition.findFirst({ where: { storeId, status: CapsuleEditionStatus.LIVE }, select: { dailyOrderCap: true, opensAtLocal: true } });
  if (!edition) return null;
  return capsuleDayStatus(prismadb, storeId, edition, now);
}

export async function setTodayCapsuleCap({ storeId, cap, userId, now = new Date() }: { storeId: string; cap: unknown; userId: string; now?: Date }) {
  const value = Number(cap);
  if (!Number.isInteger(value) || value < 0 || value > 100) throw ErrorFactory.InvalidRequest("El tope de hoy va de 0 a 100 pedidos");
  const day = bogotaDate(now);
  await prismadb.capsuleDayCap.upsert({
    where: { storeId_bogotaDate: { storeId, bogotaDate: day } },
    create: { storeId, bogotaDate: day, cap: value, setBy: userId },
    update: { cap: value, setBy: userId },
  });
  const status = await liveDayStatus(storeId, now);
  if (!status) throw ErrorFactory.Conflict("No hay una edición a la venta: el tope del día se guardó para cuando la haya");
  return status;
}
