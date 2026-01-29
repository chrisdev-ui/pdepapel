import { getCategorySales } from "@/actions/get-category-sales";
import { getSalesCount } from "@/actions/get-sales-count";
import { getSalesData } from "@/actions/get-sales-data";
import { getTopSellingProducts } from "@/actions/get-top-selling-products";
import { SalesByCategory } from "@/components/sales-by-category";
import { SalesChart } from "@/components/sales-chart";
import { TopProductsTable } from "@/components/top-products-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YearSelector } from "@/components/year-selector";
import { currencyFormatter, numberFormatter } from "@/lib/utils";

interface AnalyticsProps {
  salesData: Awaited<ReturnType<typeof getSalesCount>>;
  params: { storeId: string };
  year: number;
}

export const Analytics: React.FC<AnalyticsProps> = async ({
  params,
  year,
  salesData: sales,
}) => {
  const salesData = await getSalesData(params.storeId, year);
  const categorySales = await getCategorySales(params.storeId, year);
  const topSellingProducts = await getTopSellingProducts(params.storeId, year);

  return (
    <div className="flex flex-col space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Resumen de ventas</CardTitle>
        </CardHeader>
        <CardContent>
          <YearSelector />
          <SalesChart data={salesData} />
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ventas por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesByCategory data={categorySales} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Productos más vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <TopProductsTable topSellingProducts={topSellingProducts} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Métricas de ventas para el año {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <h3 className="text-lg font-semibold">Ganancias brutas</h3>
              <p className="text-3xl font-bold">
                {currencyFormatter(sales.totalGrossRevenue, {
                  decimalScale: 0,
                })}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Ganancias netas</h3>
              <p className="text-3xl font-bold">
                {currencyFormatter(sales.totalNetRevenue, { decimalScale: 0 })}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Descuentos totales</h3>
              <p className="text-3xl font-bold">
                {currencyFormatter(
                  sales.totalDiscounts + sales.totalCouponDiscounts,
                  { decimalScale: 0 },
                )}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Órdenes con descuento</h3>
              <p className="text-3xl font-bold">
                {numberFormatter.format(
                  sales.ordersWithDiscount + sales.ordersWithCoupon,
                )}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Descuento promedio</h3>
              <p className="text-3xl font-bold">
                {currencyFormatter(sales.averageDiscount, { decimalScale: 0 })}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                Descuento promedio por cupones
              </h3>
              <p className="text-3xl font-bold">
                {currencyFormatter(sales.averageCouponDiscount, {
                  decimalScale: 0,
                })}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                Valor promedio de una órden
              </h3>
              <p className="text-3xl font-bold">
                {currencyFormatter(sales.averageOrderValue, {
                  decimalScale: 0,
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
