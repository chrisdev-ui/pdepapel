import prismadb from "@/lib/prismadb";

export const getInventorySummary = async (storeId: string) => {
  // Parallelize queries for performance
  const [
    totalProducts,
    lowStockProducts,
    totalStockValue,
    recentMovements,
    salesMovements,
  ] = await Promise.all([
    // 1. Total Active Products
    prismadb.product.count({
      where: { storeId, isArchived: false },
    }),

    // 2. Low Stock Products (Threshold < 10 for now, customizable later)
    prismadb.product.count({
      where: {
        storeId,
        isArchived: false,
        stock: { lte: 10 },
      },
    }),

    // 3. Total Stock Value (Sum of cost * stock)
    // Prisma doesn't support computed columns in aggregation easily yet for (stock * price) across all rows without raw query or iterating.
    // For scalability, raw query is better, or we iterate if dataset < 10k.
    // Let's use a raw query for speed if using SQL, but for safety/abstraction let's fetch specific fields.
    // With large catalogs, fetching all is bad.
    // Let's try aggregation on price first (Market Value)

    // Actually, accurate Value = Sum(Product.stock * Product.acqPrice).
    // If acqPrice is missing, maybe fallback to price or 0.
    prismadb.product.findMany({
      where: { storeId, isArchived: false },
      select: { stock: true, price: true, acqPrice: true }, // Fetch just what we need
    }),

    // 4. Recent Movements
    prismadb.inventoryMovement.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { product: { select: { name: true } } },
    }),

    // 5. Financial Performance (Order Placed Analysis)
    prismadb.inventoryMovement.findMany({
      where: {
        storeId,
        type: "ORDER_PLACED",
      },
      select: {
        quantity: true,
        price: true,
        cost: true,
        product: {
          select: {
            price: true,
            acqPrice: true,
          },
        },
      },
    }),
  ]);

  // Calculate Value in memory (fast enough for < 10k items)
  const stockValue = totalStockValue.reduce((acc, item) => {
    // Use acqPrice if available (COGS), otherwise 0
    const unitValue = item.acqPrice || 0;
    return acc + item.stock * unitValue;
  }, 0);

  const retailValue = totalStockValue.reduce((acc, item) => {
    // Price is already a number/Float in this schema, so no toNumber() needed
    const unitValue = item.price || 0;
    return acc + item.stock * unitValue;
  }, 0);

  type FinancialMovement = {
    quantity: number;
    price: number | null;
    cost: number | null;
    product: {
      price: number;
      acqPrice: number | null;
    };
  };

  // Calculate Financials (Revenue & COGS)
  // Movements for ORDER_PLACED have negative quantity
  const realizedRevenue = salesMovements.reduce(
    (acc: number, item: FinancialMovement) => {
      const qty = Math.abs(item.quantity);
      const unitPrice = item.price || item.product.price || 0;
      return acc + qty * unitPrice;
    },
    0,
  );

  const realizedCOGS = salesMovements.reduce(
    (acc: number, item: FinancialMovement) => {
      const qty = Math.abs(item.quantity);
      const unitCost = item.cost || item.product.acqPrice || 0;
      return acc + qty * unitCost;
    },
    0,
  );

  // Round to 2 decimal places to avoid floating-point precision artifacts
  // (e.g. 28352319.599999998 instead of 28352319.60)
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    totalProducts,
    lowStockProducts,
    stockValue: round2(stockValue),
    retailValue: round2(retailValue),
    realizedRevenue: round2(realizedRevenue),
    realizedCOGS: round2(realizedCOGS),
    grossMargin: round2(realizedRevenue - realizedCOGS),
    recentMovements: recentMovements,
  };
};
