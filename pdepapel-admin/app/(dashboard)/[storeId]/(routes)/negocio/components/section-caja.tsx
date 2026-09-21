import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PercentageInput } from "@/components/ui/percentage-input";
import { SectionCard } from "@/components/ui/section-card";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import type { BusinessCashPolicyInput } from "@/lib/business-growth";
import type { BusinessGrowthOverview } from "@/lib/business-growth-data";
import { currencyFormatter } from "@/lib/utils";
import { AlertTriangle, Loader2, PencilLine, Plus, Save, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import {
  MOVEMENT_LABELS,
  formatDate,
  formatMonth,
  joinEs,
} from "./business-growth-labels";

/**
 * «Caja y distribución»: las reglas de reparto y los movimientos del mes.
 * Es la única vista que escribe, y lo hace con las funciones de `client.tsx`.
 */
export function SectionCaja({
  overview,
  policy,
  setPolicy,
  configuredPercent,
  cushions,
  isSavingPolicy,
  onSavePolicy,
  onNewMovement,
  onEditMovement,
  onDeleteMovement,
}: {
  overview: BusinessGrowthOverview;
  policy: BusinessCashPolicyInput;
  setPolicy: Dispatch<SetStateAction<BusinessCashPolicyInput>>;
  configuredPercent: number;
  cushions: string[];
  isSavingPolicy: boolean;
  onSavePolicy: () => void;
  onNewMovement: () => void;
  onEditMovement: (
    movement: BusinessGrowthOverview["cashMovements"][number],
  ) => void;
  onDeleteMovement: (movementId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <SectionCard
        id="reglas-distribucion"
        title="Reglas de distribución vigentes"
        description="Ajusta los límites que quieres usar para decidir. Estas reglas también recalculan períodos históricos, y la suma de reinversión y retiro no puede pasar del 100 %."
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium sm:col-span-2">
              Reserva operativa mínima
              <CurrencyInput
                value={policy.minimumOperatingReserve}
                onChange={(value) =>
                  setPolicy((current) => ({
                    ...current,
                    minimumOperatingReserve: value ?? 0,
                  }))
                }
                placeholder="Ej. 500000"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Monto que prefieres no distribuir este período.
              </span>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Reserva para impuestos
              <PercentageInput
                value={policy.taxReserveRate}
                onChange={(value) =>
                  setPolicy((current) => ({
                    ...current,
                    taxReserveRate: value ?? 0,
                  }))
                }
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Reinversión sugerida
              <PercentageInput
                value={policy.reinvestmentRate}
                onChange={(value) =>
                  setPolicy((current) => ({
                    ...current,
                    reinvestmentRate: value ?? 0,
                  }))
                }
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Retiro personal sugerido
              <PercentageInput
                value={policy.ownerDrawRate}
                onChange={(value) =>
                  setPolicy((current) => ({
                    ...current,
                    ownerDrawRate: value ?? 0,
                  }))
                }
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Porción para probar marketing
              <PercentageInput
                value={policy.marketingTestRate}
                onChange={(value) =>
                  setPolicy((current) => ({
                    ...current,
                    marketingTestRate: value ?? 0,
                  }))
                }
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Margen mínimo para pauta
              <PercentageInput
                value={policy.minimumCampaignMarginPct}
                onChange={(value) =>
                  setPolicy((current) => ({
                    ...current,
                    minimumCampaignMarginPct: value ?? 0,
                  }))
                }
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Stock mínimo para pauta
              <StockQuantityInput
                value={policy.minimumCampaignStock}
                onChange={(value) =>
                  setPolicy((current) => ({
                    ...current,
                    minimumCampaignStock: value,
                  }))
                }
                min={0}
                size="md"
                ariaLabel="Stock mínimo para pauta"
              />
            </label>
            <label className="space-y-2 text-sm font-medium sm:col-span-2">
              Cobertura mínima antes de promocionar (días)
              <StockQuantityInput
                value={policy.minimumCampaignDaysCover}
                onChange={(value) =>
                  setPolicy((current) => ({
                    ...current,
                    minimumCampaignDaysCover: value,
                  }))
                }
                min={0}
                size="md"
                ariaLabel="Cobertura mínima antes de promocionar"
              />
            </label>
          </div>
          <Alert
            variant={
              configuredPercent > 100 ? "destructive" : "default"
            }
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {configuredPercent}% de la utilidad distribuible
            </AlertTitle>
            <AlertDescription>
              Reinversión {policy.reinvestmentRate}% + retiro personal{" "}
              {policy.ownerDrawRate}%.
              {configuredPercent > 100
                ? " Reduce uno de los dos valores antes de guardar."
                : configuredPercent === 100
                  ? " No queda nada sin repartir."
                  : ` El ${100 - configuredPercent}% restante queda como margen de seguridad.`}
            </AlertDescription>
          </Alert>
          {cushions.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-tint-cream p-3 text-xs leading-relaxed text-primary">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <p>
                Con estas reglas no estás apartando {joinEs(cushions)}.
                Puedes guardarlas igual —estas cifras solo alimentan
                recomendaciones, no mueven dinero—, pero el mes que
                llegue un gasto grande o la declaración, no habrá de
                dónde sacarlo.
              </p>
            </div>
          )}
          <Button
            onClick={onSavePolicy}
            disabled={isSavingPolicy || configuredPercent > 100}
          >
            {isSavingPolicy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar reglas
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        id="movimientos-del-mes"
        title={`Movimientos de ${formatMonth(overview.period.label)}`}
        description="Registra lo que efectivamente salió o entró. Las compras de inventario se muestran aparte para no duplicar el costo de venta."
        action={
          <Button size="sm" onClick={onNewMovement}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar
          </Button>
        }
      >
        <div>
          {overview.cashMovements.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no hay movimientos manuales este mes. Empieza por
              gastos, impuestos, compras de inventario o retiros
              personales.
            </div>
          ) : (
            <div className="space-y-3">
              {overview.cashMovements.map((movement) => (
                <div
                  key={movement.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {movement.description}
                      </p>
                      <Badge variant="secondary">
                        {MOVEMENT_LABELS[movement.type]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(movement.occurredAt)}
                      {movement.reference
                        ? ` · ${movement.reference}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <p className="mr-auto font-semibold sm:mr-2">
                      {currencyFormatter(movement.amount)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditMovement(movement)}
                      aria-label={`Editar ${movement.description}`}
                    >
                      <PencilLine className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteMovement(movement.id)}
                      aria-label={`Eliminar ${movement.description}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
