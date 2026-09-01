"use client";

import { ActionConfirmationDialog } from "@/components/modals/action-confirmation-dialog";
import { BiMonthPicker } from "@/components/bi/bi-month-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { PercentageInput } from "@/components/ui/percentage-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  type BusinessCashMovementType,
  type BusinessCashPolicyInput,
} from "@/lib/business-growth";
import type { BusinessGrowthOverview } from "@/lib/business-growth-data";
import {
  getBusinessGrowthPeriodDateBounds,
  getDefaultBusinessMovementDate,
} from "@/lib/business-growth-period";
import { cn, currencyFormatter } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDownRight,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Landmark,
  Lightbulb,
  Loader2,
  Megaphone,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

const MOVEMENT_LABELS: Record<BusinessCashMovementType, string> = {
  OPERATING_EXPENSE: "Gasto operativo",
  MARKETING_SPEND: "Inversión en marketing",
  TAX_PAYMENT: "Pago de impuestos",
  INVENTORY_PURCHASE: "Compra o reposición de inventario",
  OWNER_DRAW: "Retiro personal",
  OWNER_CONTRIBUTION: "Aporte personal al negocio",
  OTHER_INFLOW: "Otro ingreso",
  OTHER_OUTFLOW: "Otro egreso",
};

const MOVEMENT_OPTIONS = Object.entries(MOVEMENT_LABELS) as Array<
  [BusinessCashMovementType, string]
>;

const CAMPAIGN_STATE = {
  READY_TO_TEST: {
    label: "Lista para prueba",
    variant: "success" as const,
  },
  ORGANIC_FIRST: {
    label: "Primero orgánico",
    variant: "info" as const,
  },
  HOLD: {
    label: "No promocionar aún",
    variant: "warning" as const,
  },
};

const CAMPAIGN_STATUS = {
  DRAFT: "Borrador",
  READY: "Lista para revisar",
  ACTIVE: "Activa externamente",
  PAUSED: "Pausada",
  COMPLETED: "Finalizada",
  ARCHIVED: "Archivada",
};

type CashMovementForm = {
  type: BusinessCashMovementType;
  amount?: number;
  description: string;
  occurredAt: string;
  reference: string;
  notes: string;
};

type CampaignDraftForm = {
  productId: string;
  name: string;
  channel: "INSTAGRAM" | "TIKTOK" | "MULTI_CHANNEL";
  objective: "SALES" | "TRAFFIC";
  plannedBudget?: number;
  seasonLabel: string;
  brief: string;
};

const INITIAL_MOVEMENT_FORM: CashMovementForm = {
  type: "OPERATING_EXPENSE",
  amount: undefined,
  description: "",
  occurredAt: "",
  reference: "",
  notes: "",
};

function formatMonth(value: string) {
  return value.replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  return body?.error || body?.message || "No fue posible completar la acción";
}

function policyPayload(policy: BusinessCashPolicyInput) {
  return {
    minimumOperatingReserve: policy.minimumOperatingReserve,
    taxReserveRate: policy.taxReserveRate,
    reinvestmentRate: policy.reinvestmentRate,
    ownerDrawRate: policy.ownerDrawRate,
    marketingTestRate: policy.marketingTestRate,
    minimumCampaignMarginPct: policy.minimumCampaignMarginPct,
    minimumCampaignStock: policy.minimumCampaignStock,
    minimumCampaignDaysCover: policy.minimumCampaignDaysCover,
  };
}

function CashPlanCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
  tone?: "default" | "positive" | "warning";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p
              className={cn(
                "mt-2 text-2xl font-bold tracking-tight",
                tone === "positive" && "text-green-700",
                tone === "warning" && "text-amber-700",
              )}
            >
              {currencyFormatter(value)}
            </p>
          </div>
          <Icon
            className={cn(
              "h-5 w-5 text-muted-foreground",
              tone === "positive" && "text-green-600",
              tone === "warning" && "text-amber-600",
            )}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

export function BusinessGrowthClient({
  storeId,
  initialData,
}: {
  storeId: string;
  initialData: BusinessGrowthOverview;
}) {
  const { toast } = useToast();
  const [overview, setOverview] = useState(initialData);
  const [policy, setPolicy] = useState<BusinessCashPolicyInput>(
    policyPayload(initialData.policy),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChangingPeriod, setIsChangingPeriod] = useState(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [isSavingMovement, setIsSavingMovement] = useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isMovementDialogOpen, setIsMovementDialogOpen] = useState(false);
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [movementForm, setMovementForm] = useState<CashMovementForm>(
    INITIAL_MOVEMENT_FORM,
  );
  const [editingMovementId, setEditingMovementId] = useState<string | null>(
    null,
  );
  const [campaignForm, setCampaignForm] = useState<CampaignDraftForm | null>(
    null,
  );
  const [movementToDelete, setMovementToDelete] = useState<string | null>(null);

  const refreshOverview = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const query = new URLSearchParams({
        month: String(overview.period.month),
        year: String(overview.period.year),
      });
      const response = await fetch(
        `/api/${storeId}/business-growth/overview?${query.toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response));
      const nextOverview = (await response.json()) as BusinessGrowthOverview;
      setOverview(nextOverview);
      setPolicy(policyPayload(nextOverview.policy));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo actualizar el panel",
        description:
          error instanceof Error
            ? error.message
            : "Inténtalo de nuevo en unos segundos.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [overview.period.month, overview.period.year, storeId, toast]);

  const currentCashPlan = overview.cashPlan;
  const configuredPercent = useMemo(
    () => policy.reinvestmentRate + policy.ownerDrawRate,
    [policy.ownerDrawRate, policy.reinvestmentRate],
  );

  const savePolicy = async () => {
    setIsSavingPolicy(true);
    try {
      const response = await fetch(`/api/${storeId}/business-growth/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!response.ok) throw new Error(await readError(response));
      toast({
        title: "Configuración guardada",
        description:
          "Las próximas recomendaciones usarán estos límites sin mover dinero.",
      });
      await refreshOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar la configuración",
        description:
          error instanceof Error
            ? error.message
            : "Revisa los valores e inténtalo.",
      });
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const openNewMovement = () => {
    setEditingMovementId(null);
    setMovementForm({
      ...INITIAL_MOVEMENT_FORM,
      occurredAt: getDefaultBusinessMovementDate(overview.period),
    });
    setIsMovementDialogOpen(true);
  };

  const openEditMovement = (
    movement: BusinessGrowthOverview["cashMovements"][number],
  ) => {
    setEditingMovementId(movement.id);
    setMovementForm({
      type: movement.type,
      amount: movement.amount,
      description: movement.description,
      occurredAt: movement.occurredAt.slice(0, 10),
      reference: movement.reference ?? "",
      notes: movement.notes ?? "",
    });
    setIsMovementDialogOpen(true);
  };

  const saveMovement = async () => {
    setIsSavingMovement(true);
    try {
      const endpoint = editingMovementId
        ? `/api/${storeId}/business-growth/cash-movements/${editingMovementId}`
        : `/api/${storeId}/business-growth/cash-movements`;
      const response = await fetch(endpoint, {
        method: editingMovementId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(movementForm),
      });
      if (!response.ok) throw new Error(await readError(response));
      setIsMovementDialogOpen(false);
      toast({
        title: editingMovementId
          ? "Movimiento actualizado"
          : "Movimiento registrado",
        description:
          "El panel recalculará sus sugerencias con este registro; no modifica pedidos ni impuestos.",
      });
      await refreshOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar el movimiento",
        description:
          error instanceof Error
            ? error.message
            : "Revisa los datos e inténtalo.",
      });
    } finally {
      setIsSavingMovement(false);
    }
  };

  const deleteMovement = async () => {
    if (!movementToDelete) return;
    try {
      const response = await fetch(
        `/api/${storeId}/business-growth/cash-movements/${movementToDelete}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setMovementToDelete(null);
      toast({
        title: "Movimiento eliminado",
        description:
          "El cálculo del período ya no tiene en cuenta ese registro.",
      });
      await refreshOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo eliminar el movimiento",
        description:
          error instanceof Error
            ? error.message
            : "Inténtalo de nuevo en unos segundos.",
      });
    }
  };

  const openCampaignDraft = (
    recommendation: BusinessGrowthOverview["campaignRecommendations"][number],
  ) => {
    setCampaignForm({
      productId: recommendation.productId,
      name: `Prueba ${recommendation.productName}`.slice(0, 160),
      channel: recommendation.channel,
      objective: recommendation.objective,
      plannedBudget: recommendation.suggestedBudget || undefined,
      seasonLabel: overview.season,
      brief: recommendation.brief,
    });
    setIsCampaignDialogOpen(true);
  };

  const saveCampaignDraft = async () => {
    if (!campaignForm) return;
    setIsSavingCampaign(true);
    try {
      const response = await fetch(
        `/api/${storeId}/business-growth/campaigns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...campaignForm, status: "DRAFT" }),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      setIsCampaignDialogOpen(false);
      toast({
        title: "Borrador guardado",
        description:
          "No se publicó ni se cobró nada. El enlace incluye medición para cuando decidas usarlo.",
      });
      await refreshOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar el borrador",
        description:
          error instanceof Error
            ? error.message
            : "Inténtalo de nuevo en unos segundos.",
      });
    } finally {
      setIsSavingCampaign(false);
    }
  };

  const updateCampaignStatus = async (
    campaignId: string,
    status: "READY" | "PAUSED" | "COMPLETED" | "ARCHIVED",
  ) => {
    try {
      const response = await fetch(
        `/api/${storeId}/business-growth/campaigns/${campaignId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      toast({
        title: "Estado actualizado",
        description:
          "Esto organiza el borrador interno; no inicia, pausa ni cobra campañas externas.",
      });
      await refreshOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo actualizar la campaña",
        description:
          error instanceof Error
            ? error.message
            : "Inténtalo de nuevo en unos segundos.",
      });
    }
  };

  const copyCampaignLink = async (
    campaign: BusinessGrowthOverview["campaigns"][number],
  ) => {
    try {
      await navigator.clipboard.writeText(
        `https://papeleriapdepapel.com${campaign.landingPath}`,
      );
      toast({
        title: "Enlace copiado",
        description: "Puedes usarlo al crear contenido o una campaña externa.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "No se pudo copiar el enlace",
        description: "Cópialo manualmente desde el borrador de la campaña.",
      });
    }
  };

  return (
    <div className="flex-col">
      <div
        className={cn(
          "flex-1 space-y-6 p-4 pt-6 md:p-8 md:pt-6 [&>*:not(:first-child)]:transition-opacity [&>*:not(:first-child)]:duration-200",
          isChangingPeriod &&
            "[&>*:not(:first-child)]:pointer-events-none [&>*:not(:first-child)]:opacity-50",
        )}
        aria-busy={isChangingPeriod}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <Heading
            title="Negocio y crecimiento"
            description={`Caja de ${formatMonth(overview.period.label)} y campañas basadas en la situación actual.`}
          />
          <div className="flex flex-col gap-2 sm:items-end">
            <span className="text-xs font-medium text-muted-foreground">
              Período financiero
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <BiMonthPicker
                activeYear={overview.period.year}
                activeMonth={overview.period.month - 1}
                onLoadingChange={setIsChangingPeriod}
              />
              <Button
                variant="outline"
                onClick={refreshOverview}
                disabled={isRefreshing || isChangingPeriod}
              >
                {isChangingPeriod ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span role="status" aria-live="polite">
                      Cargando período…
                    </span>
                  </>
                ) : isRefreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {!isChangingPeriod && "Actualizar datos"}
              </Button>
            </div>
          </div>
        </div>

        <Alert variant="info">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Panel para decidir, no para mover dinero</AlertTitle>
          <AlertDescription>
            Usa estas cifras como guía. Registra gastos y retiros reales, valida
            impuestos con tu contador y conserva Mercado Pago, bancos e
            Instagram o TikTok como la fuente final de cualquier movimiento
            externo.
          </AlertDescription>
        </Alert>

        {!overview.period.isCurrent && (
          <Alert variant="info">
            <CalendarDays className="h-4 w-4" />
            <AlertTitle>Estás revisando un período histórico</AlertTitle>
            <AlertDescription>
              Las ventas, la utilidad y los movimientos corresponden a{" "}
              {formatMonth(overview.period.label)}. La distribución se simula
              con las reglas vigentes; las recomendaciones de campañas e
              inventario conservan la situación actual.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CashPlanCard
            title="Ventas netas registradas"
            value={overview.financial.netRevenue}
            description={`${overview.financial.salesCount} ventas pagadas o enviadas del período, incluyendo ventas liquidadas de Mercado Libre.`}
            icon={CircleDollarSign}
          />
          <CashPlanCard
            title="Utilidad operativa estimada"
            value={currentCashPlan.operatingProfit}
            description="Antes de descontar los gastos manuales que registres abajo. Revisa costos de productos faltantes."
            icon={WalletCards}
            tone="positive"
          />
          <CashPlanCard
            title="Gastos registrados"
            value={currentCashPlan.registeredExpenses}
            description="Incluye gastos operativos, marketing, impuestos y otros egresos de este período."
            icon={ArrowDownRight}
            tone="warning"
          />
          <CashPlanCard
            title="Retiro personal sugerido"
            value={currentCashPlan.remainingOwnerDraw}
            description="Orientación después de la reserva y de los retiros que ya registraste. No confirma saldo bancario."
            icon={Landmark}
            tone="positive"
          />
        </div>

        <Tabs defaultValue="summary" className="space-y-5">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-3 sm:gap-3">
            <TabsTrigger
              value="summary"
              className="border bg-background px-4 py-2.5"
            >
              Resumen
            </TabsTrigger>
            <TabsTrigger
              value="cash"
              className="border bg-background px-4 py-2.5"
            >
              Caja y distribución
            </TabsTrigger>
            <TabsTrigger
              value="campaigns"
              className="border bg-background px-4 py-2.5"
            >
              Campañas actuales
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <WalletCards className="h-5 w-5" />
                    Propuesta para la utilidad del período
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    <p className="mt-1 text-xl font-bold text-green-700">
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardList className="h-5 w-5" />
                    Calidad actual de los datos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <p>{overview.dataQuality.note}</p>
                  {!overview.period.isCurrent && (
                    <p>
                      Este control revisa el catálogo activo hoy, no una copia
                      histórica del catálogo.
                    </p>
                  )}
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <span className="font-semibold">
                      {overview.dataQuality.productsWithoutCost}
                    </span>{" "}
                    productos activos sin costo de compra válido.
                  </div>
                  <p>
                    La utilidad histórica puede cambiar si faltan costos,
                    comisiones o gastos. Este panel no reemplaza la contabilidad
                    formal.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cash" className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PencilLine className="h-5 w-5" />
                    Reglas de distribución vigentes
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Ajusta los límites que quieres usar para decidir. Estas
                    reglas también recalculan períodos históricos y la suma de
                    reinversión y retiro no puede pasar del 100%.
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
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
                        : " El resto queda como margen de seguridad."}
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={savePolicy}
                    disabled={isSavingPolicy || configuredPercent > 100}
                  >
                    {isSavingPolicy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Guardar reglas
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5" />
                      Movimientos de {formatMonth(overview.period.label)}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Registra lo que efectivamente salió o entró. Las compras
                      de inventario se muestran aparte para no duplicar el costo
                      de venta.
                    </p>
                  </div>
                  <Button size="sm" onClick={openNewMovement}>
                    <Plus className="mr-2 h-4 w-4" />
                    Registrar
                  </Button>
                </CardHeader>
                <CardContent>
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
                              onClick={() => openEditMovement(movement)}
                              aria-label={`Editar ${movement.description}`}
                            >
                              <PencilLine className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setMovementToDelete(movement.id)}
                              aria-label={`Eliminar ${movement.description}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-5">
            <Alert variant="info">
              <Megaphone className="h-4 w-4" />
              <AlertTitle>
                Recomendaciones actuales, sin anuncios automáticos
              </AlertTitle>
              <AlertDescription>
                Estas sugerencias usan el stock, los riesgos y el presupuesto
                del mes actual, aunque estés revisando otro período. Esta
                primera versión guarda borradores con enlace medible, pero nunca
                publica, enciende, pausa ni cambia presupuestos en Instagram o
                TikTok.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 xl:grid-cols-2">
              {overview.campaignRecommendations.map((recommendation) => {
                const state = CAMPAIGN_STATE[recommendation.state];
                return (
                  <Card key={recommendation.productId}>
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold">
                            {recommendation.productName}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {recommendation.reason}
                          </p>
                        </div>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </div>
                      <div className="rounded-md bg-muted/60 p-3 text-sm">
                        <p className="font-medium">Idea de contenido</p>
                        <p className="mt-1 text-muted-foreground">
                          {recommendation.brief}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          Presupuesto de prueba:{" "}
                          {currencyFormatter(recommendation.suggestedBudget)}
                        </span>
                        <span className="truncate">
                          {recommendation.landingPath}
                        </span>
                      </div>
                      <Button
                        variant={
                          recommendation.state === "HOLD"
                            ? "outline"
                            : "default"
                        }
                        onClick={() => openCampaignDraft(recommendation)}
                      >
                        <Lightbulb className="mr-2 h-4 w-4" />
                        Preparar borrador
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Borradores y seguimiento interno
                </CardTitle>
              </CardHeader>
              <CardContent>
                {overview.campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Guarda un borrador para organizar una idea y conservar su
                    enlace medible.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {overview.campaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{campaign.name}</p>
                            <Badge variant="secondary">
                              {CAMPAIGN_STATUS[campaign.status]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {campaign.productNames.join(", ")} ·{" "}
                            {campaign.channel === "MULTI_CHANNEL"
                              ? "Instagram y TikTok"
                              : campaign.channel === "INSTAGRAM"
                                ? "Instagram"
                                : "TikTok"}
                            {campaign.plannedBudget
                              ? ` · ${currencyFormatter(campaign.plannedBudget)}`
                              : " · Sin presupuesto asignado"}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {campaign.landingPath}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyCampaignLink(campaign)}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Copiar enlace
                          </Button>
                          {campaign.status === "DRAFT" && (
                            <Button
                              size="sm"
                              onClick={() =>
                                updateCampaignStatus(campaign.id, "READY")
                              }
                            >
                              Marcar lista
                            </Button>
                          )}
                          {campaign.status !== "ARCHIVED" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                updateCampaignStatus(campaign.id, "ARCHIVED")
                              }
                            >
                              Archivar
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conexiones de Instagram y TikTok</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="font-medium">Instagram / Meta</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    La siguiente entrega conectará una cuenta profesional
                    mediante OAuth, consultará resultados y exigirá confirmación
                    antes de crear o modificar anuncios.
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="font-medium">TikTok</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    La integración usará una cuenta Business y autorización
                    explícita. Los borradores actuales ya conservan producto,
                    presupuesto y UTM para enlazarla.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={isMovementDialogOpen}
        onOpenChange={setIsMovementDialogOpen}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingMovementId ? "Editar movimiento" : "Registrar movimiento"}
            </DialogTitle>
            <DialogDescription>
              Registra un hecho real de caja. Esto no crea compras, pedidos ni
              documentos tributarios.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="space-y-2 text-sm font-medium">
              Tipo de movimiento
              <Select
                value={movementForm.type}
                onValueChange={(value) =>
                  setMovementForm((current) => ({
                    ...current,
                    type: value as BusinessCashMovementType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Valor
                <CurrencyInput
                  value={movementForm.amount}
                  onChange={(value) =>
                    setMovementForm((current) => ({
                      ...current,
                      amount: value,
                    }))
                  }
                  placeholder="Ej. 50000"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Fecha
                <Input
                  type="date"
                  value={movementForm.occurredAt}
                  min={getBusinessGrowthPeriodDateBounds(overview.period).min}
                  max={getBusinessGrowthPeriodDateBounds(overview.period).max}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      occurredAt: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="space-y-2 text-sm font-medium">
              Descripción
              <Input
                value={movementForm.description}
                onChange={(event) =>
                  setMovementForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Ej. Empaques para pedidos de agosto"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Referencia (opcional)
              <Input
                value={movementForm.reference}
                onChange={(event) =>
                  setMovementForm((current) => ({
                    ...current,
                    reference: event.target.value,
                  }))
                }
                placeholder="Factura, comprobante o nota"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Nota (opcional)
              <Textarea
                value={movementForm.notes}
                onChange={(event) =>
                  setMovementForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Información que ayude a recordar este movimiento"
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsMovementDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={saveMovement} disabled={isSavingMovement}>
              {isSavingMovement && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar movimiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCampaignDialogOpen}
        onOpenChange={setIsCampaignDialogOpen}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Preparar borrador social</DialogTitle>
            <DialogDescription>
              Ajusta la idea antes de guardarla. Aún no conecta cuentas, publica
              contenido ni gasta dinero.
            </DialogDescription>
          </DialogHeader>
          {campaignForm && (
            <div className="grid gap-4">
              <label className="space-y-2 text-sm font-medium">
                Nombre interno
                <Input
                  value={campaignForm.name}
                  onChange={(event) =>
                    setCampaignForm(
                      (current) =>
                        current && { ...current, name: event.target.value },
                    )
                  }
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Canal previsto
                  <Select
                    value={campaignForm.channel}
                    onValueChange={(value) =>
                      setCampaignForm(
                        (current) =>
                          current && {
                            ...current,
                            channel: value as CampaignDraftForm["channel"],
                          },
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MULTI_CHANNEL">
                        Instagram y TikTok
                      </SelectItem>
                      <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                      <SelectItem value="TIKTOK">TikTok</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Objetivo
                  <Select
                    value={campaignForm.objective}
                    onValueChange={(value) =>
                      setCampaignForm(
                        (current) =>
                          current && {
                            ...current,
                            objective: value as CampaignDraftForm["objective"],
                          },
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALES">Ventas</SelectItem>
                      <SelectItem value="TRAFFIC">
                        Visitas a la tienda
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Presupuesto máximo (opcional)
                  <CurrencyInput
                    value={campaignForm.plannedBudget}
                    onChange={(value) =>
                      setCampaignForm(
                        (current) =>
                          current && { ...current, plannedBudget: value },
                      )
                    }
                    placeholder="Sin presupuesto"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Temporada
                  <Input
                    value={campaignForm.seasonLabel}
                    onChange={(event) =>
                      setCampaignForm(
                        (current) =>
                          current && {
                            ...current,
                            seasonLabel: event.target.value,
                          },
                      )
                    }
                  />
                </label>
              </div>
              <label className="space-y-2 text-sm font-medium">
                Idea de contenido
                <Textarea
                  value={campaignForm.brief}
                  onChange={(event) =>
                    setCampaignForm(
                      (current) =>
                        current && { ...current, brief: event.target.value },
                    )
                  }
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCampaignDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={saveCampaignDraft} disabled={isSavingCampaign}>
              {isSavingCampaign && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar borrador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionConfirmationDialog
        isOpen={Boolean(movementToDelete)}
        onOpenChange={(open) => !open && setMovementToDelete(null)}
        onConfirm={deleteMovement}
        title="Eliminar movimiento"
        description="Esta acción quitará el registro de este período y recalculará las sugerencias. No elimina pedidos, facturas ni compras de inventario."
        confirmLabel="Eliminar movimiento"
        destructive
      />
    </div>
  );
}
