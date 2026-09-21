"use client";

import { ActionConfirmationDialog } from "@/components/modals/action-confirmation-dialog";
import { BiMonthPicker } from "@/components/bi/bi-month-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { PercentageInput } from "@/components/ui/percentage-input";
import { SectionCard } from "@/components/ui/section-card";
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
  MOVEMENT_OPTIONS,
  formatMonth,
  joinEs,
} from "./business-growth-labels";
import { SectionCaja } from "./section-caja";
import { SectionCampanas } from "./section-campanas";
import { SectionResumen } from "./section-resumen";
import {
  BUSINESS_GROWTH_SECTIONS,
  isBusinessGrowthSection,
  type BusinessGrowthSection,
} from "@/lib/business-growth-sections";
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
import { useCallback, useMemo, useState } from "react";

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

export function BusinessGrowthClient({
  storeId,
  initialData,
  section = "resumen",
}: {
  storeId: string;
  initialData: BusinessGrowthOverview;
  /** La vista de adentro con la que se entra, leída de `?sub=`. */
  section?: BusinessGrowthSection;
}) {
  const { toast } = useToast();
  const [overview, setOverview] = useState(initialData);
  const [activeSection, setActiveSection] =
    useState<BusinessGrowthSection>(section);
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

  /**
   * La vista de adentro, recordada.
   *
   * Antes era `defaultValue`: cambiabas de pestaña arriba, volvías, y siempre
   * caías en «Resumen» aunque estuvieras trabajando en Caja. Ahora viaja en la
   * dirección, así que sobrevive a recargar, a compartir el enlace y al botón
   * de atrás. Se escribe con `history.replaceState` y no con el router para
   * que cambiar de vista siga siendo instantáneo: no hay nada que volver a
   * pedirle al servidor.
   */
  const changeSection = useCallback((next: string) => {
    if (!isBusinessGrowthSection(next)) return;
    setActiveSection(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "resumen") url.searchParams.delete("sub");
    else url.searchParams.set("sub", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const currentCashPlan = overview.cashPlan;
  const configuredPercent = useMemo(
    () => policy.reinvestmentRate + policy.ownerDrawRate,
    [policy.ownerDrawRate, policy.reinvestmentRate],
  );
  /**
   * Qué falta por apartar. El panel no impone un mínimo —no hay una regla
   * tributaria real que copiar, y cualquier piso que ponga el código sería un
   * número inventado—, pero tampoco puede afirmar que hay colchón cuando no lo
   * hay: con el reparto al 100 % exacto el aviso decía «el resto queda como
   * margen de seguridad», y el resto era cero.
   */
  const cushions = useMemo(() => {
    const missing: string[] = [];
    if (policy.taxReserveRate === 0) missing.push("nada para impuestos");
    if (policy.minimumOperatingReserve === 0)
      missing.push("nada de reserva operativa");
    if (configuredPercent >= 100) missing.push("nada sin repartir");
    return missing;
  }, [
    configuredPercent,
    policy.minimumOperatingReserve,
    policy.taxReserveRate,
  ]);

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
          <p className="text-sm text-muted-foreground">
            Caja de{" "}
            <strong className="text-primary">
              {formatMonth(overview.period.label)}
            </strong>{" "}
            y campañas basadas en la situación actual.
          </p>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Ventas netas registradas"
            value={currencyFormatter(overview.financial.netRevenue)}
            note={`${overview.financial.salesCount} ventas del mes`}
            icon={<CircleDollarSign className="h-4 w-4" aria-hidden="true" />}
            tint="bg-tint-sky"
          />
          <MetricCard
            label="Utilidad operativa estimada"
            value={currencyFormatter(currentCashPlan.operatingProfit)}
            note="Antes de los gastos de abajo"
            icon={<WalletCards className="h-4 w-4" aria-hidden="true" />}
            tint="bg-tint-mint"
          />
          <MetricCard
            label="Gastos registrados"
            value={currencyFormatter(currentCashPlan.registeredExpenses)}
            note="Operación, marketing e impuestos"
            icon={<ArrowDownRight className="h-4 w-4" aria-hidden="true" />}
            tint="bg-tint-cream"
          />
          <MetricCard
            label="Retiro personal sugerido"
            value={currencyFormatter(currentCashPlan.remainingOwnerDraw)}
            note="Guía; no es tu saldo real"
            icon={<Landmark className="h-4 w-4" aria-hidden="true" />}
            tint="bg-tint-lavender"
          />
        </div>

        <Tabs
          value={activeSection}
          onValueChange={changeSection}
          className="space-y-5"
        >
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-3 sm:gap-3">
            {BUSINESS_GROWTH_SECTIONS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="min-h-11 border bg-background px-4 py-2.5"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="resumen" className="space-y-5">
            <SectionResumen overview={overview} />
          </TabsContent>

          <TabsContent value="caja" className="space-y-5">
            <SectionCaja
              overview={overview}
              policy={policy}
              setPolicy={setPolicy}
              configuredPercent={configuredPercent}
              cushions={cushions}
              isSavingPolicy={isSavingPolicy}
              onSavePolicy={savePolicy}
              onNewMovement={openNewMovement}
              onEditMovement={openEditMovement}
              onDeleteMovement={setMovementToDelete}
            />
          </TabsContent>

          <TabsContent value="campanas" className="space-y-5">
            <SectionCampanas
              overview={overview}
              onPrepareDraft={openCampaignDraft}
              onUpdateStatus={updateCampaignStatus}
              onCopyLink={copyCampaignLink}
            />
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <DateField
                  aria-label="Fecha del movimiento"
                  value={movementForm.occurredAt}
                  min={getBusinessGrowthPeriodDateBounds(overview.period).min}
                  max={getBusinessGrowthPeriodDateBounds(overview.period).max}
                  onChange={(occurredAt) =>
                    setMovementForm((current) => ({
                      ...current,
                      occurredAt,
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
