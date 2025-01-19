import { getAverageOrderValue } from "@/actions/get-average-order-value";
import { getCategorySales } from "@/actions/get-category-sales";
import { getSalesData } from "@/actions/get-sales-data";
import { getTopSellingProducts } from "@/actions/get-top-selling-products";
import { SalesByCategory } from "@/components/sales-by-category";
import { SalesChart } from "@/components/sales-chart";
import { TopProductsTable } from "@/components/top-products-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YearSelector } from "@/components/year-selector";
import { currencyFormatter } from "@/lib/utils";

interface AnalyticsProps {
  params: { storeId: string };
  year: number;
}

export const Analytics: React.FC<AnalyticsProps> = async ({ params, year }) => {
  const salesData = await getSalesData(params.storeId, year);
  const categorySales = await getCategorySales(params.storeId, year);
  const averageOrderValue = await getAverageOrderValue(params.storeId, year);
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
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold">
                Valor promedio de una órden
              </h3>
              <p className="text-3xl font-bold">
                {currencyFormatter.format(averageOrderValue)}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Ventas totales</h3>
              <p className="text-3xl font-bold">
                {currencyFormatter.format(
                  salesData.reduce((sum, data) => sum + data.revenue, 0),
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
