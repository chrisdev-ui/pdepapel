import prismadb from "@/lib/prismadb";

/**
 * Recalcula `Product.soldCount` (unidades en pedidos pagados o enviados)
 * para todos los productos. Se ejecuta a diario desde el cron de ofertas;
 * el orden «Más vendidos» de la tienda lee esta columna.
 */
export async function refreshSoldCounts(): Promise<number> {
  return prismadb.$executeRaw`
    UPDATE \`Product\` p
    LEFT JOIN (
      SELECT oi.productId, SUM(oi.quantity) AS units
      FROM \`OrderItem\` oi
      INNER JOIN \`Order\` o ON o.id = oi.orderId
      WHERE oi.productId IS NOT NULL AND o.status IN ('PAID', 'SENT')
      GROUP BY oi.productId
    ) s ON s.productId = p.id
    SET p.soldCount = COALESCE(s.units, 0)
    WHERE p.soldCount <> COALESCE(s.units, 0)
  `;
}
