import { SectionCard } from "@/components/ui/section-card";
import type { BusinessGrowthOverview } from "@/lib/business-growth-data";
import { currencyFormatter } from "@/lib/utils";

/**
 * «Resumen»: la propuesta de reparto del mes y qué tan fiables son las cifras.
 * Solo pinta; el estado y las llamadas viven en `client.tsx`.
 */
export function SectionResumen({
  overview,
}: {
  overview: BusinessGrowthOverview;
}) {
  const currentCashPlan = overview.cashPlan;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <SectionCard
        id="propuesta-utilidad"
        title="Propuesta para la utilidad del período"
        description="Con las reglas que tienes puestas hoy. Es una propuesta: no mueve un peso."
        className="lg:col-span-2"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Reserva para impuestos
            </p>
            <p className="mt-1 text-xl font-bold">
              {currencyFormatter(currentCashPlan.proposedTaxReserve)}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Reinversión sugerida
            </p>
            <p className="mt-1 text-xl font-bold text-primary">
              {currencyFormatter(
                currentCashPlan.recommendedReinvestment,
              )}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Prueba de marketing incluida
            </p>
            <p className="mt-1 text-xl font-bold">
              {currencyFormatter(
                currentCashPlan.suggestedMarketingTestBudget,
              )}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Retiro ya registrado
            </p>
            <p className="mt-1 text-xl font-bold">
              {currencyFormatter(currentCashPlan.recordedOwnerDraws)}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Compras de inventario registradas
            </p>
            <p className="mt-1 text-xl font-bold">
              {currencyFormatter(
                currentCashPlan.inventoryPurchaseCommitments,
              )}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Monto sin asignar
            </p>
            <p className="mt-1 text-xl font-bold">
              {currencyFormatter(
                currentCashPlan.unallocatedSafetyAmount,
              )}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        id="calidad-datos"
        title="Qué tan fiables son estas cifras"
        description="Antes de decidir con ellas, mira si falta algo por cargar."
      >
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>{overview.dataQuality.note}</p>
          {!overview.period.isCurrent && (
            <p>
              Este control revisa el catálogo activo hoy, no una copia
              histórica del catálogo.
            </p>
          )}
          <div className="rounded-lg bg-tint-cream p-3 text-primary">
            <strong>{overview.dataQuality.productsWithoutCost}</strong>{" "}
            {overview.dataQuality.productsWithoutCost === 1
              ? "producto activo sin costo de compra válido."
              : "productos activos sin costo de compra válido."}
          </div>
          <p>
            La utilidad histórica puede cambiar si faltan costos,
            comisiones o gastos. Este panel no reemplaza la contabilidad
            formal.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
