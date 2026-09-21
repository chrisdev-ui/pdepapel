import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";

/**
 * Pregunta barata que cambia cuando cambian las ventas de una tienda: cuántos
 * pedidos cobrados hay y cuál se tocó de último. Crear, editar o borrar
 * cualquiera mueve uno de los dos números.
 *
 * Es lo que deja reutilizar el gráfico del año y el conteo de ventas sin
 * arriesgarse a enseñar cifras viejas: si alguien acaba de registrar una
 * venta, la marca cambia y se vuelve a calcular.
 */
export async function salesWatermark(storeId: string): Promise<string> {
  const { _count, _max } = await prismadb.order.aggregate({
    where: { storeId, status: { in: [OrderStatus.PAID, OrderStatus.SENT] } },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return `${_count._all}:${_max.updatedAt?.getTime() ?? 0}`;
}
