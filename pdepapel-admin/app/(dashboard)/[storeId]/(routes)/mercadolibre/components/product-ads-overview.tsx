"use client";

import { MercadoLibreLogo } from "@/components/mercadolibre-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  BarChart3,
  Loader2,
  Megaphone,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

type ProductAdsMetrics = {
  clicks: number;
  prints: number;
  cost: number;
  cpc: number | null;
  ctr: number | null;
  acos: number | null;
  roas: number | null;
  cvr: number | null;
  totalAmount: number;
  unitsQuantity: number;
};

type CampaignStrategy = "profitability" | "increase" | "visibility";

type ProductAdsCampaign = {
  id: string;
  name: string;
  status: string | null;
  budget: number | null;
  dailyBudget: number | null;
  roasTarget: number | null;
  strategy: CampaignStrategy | null;
  automaticBudget: boolean | null;
  lastUpdated: string | null;
  metrics: ProductAdsMetrics;
};

type ProductAdsOverview =
  | {
      state: "READY";
      advertiser: { id: string; name: string | null };
      range: { from: string; to: string };
      currencyId: string;
      totalCampaigns: number;
      campaigns: ProductAdsCampaign[];
      summary: ProductAdsMetrics;
    }
  | {
      state: "NOT_ENABLED" | "REAUTH_REQUIRED";
      message: string;
    };

type CampaignAction = "PAUSE" | "ACTIVATE" | "UPDATE_SETTINGS";

type CampaignActionDialog = {
  campaign: ProductAdsCampaign;
  action: CampaignAction;
  budget: number | undefined;
  roasTarget: number | undefined;
  strategy: CampaignStrategy | null;
};

type Feedback = { type: "error" | "success"; message: string };

const campaignStatusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  ACTIVE: { label: "Activa", variant: "default" },
  PAUSED: { label: "Pausada", variant: "secondary" },
  HOLD: { label: "Suspendida por Mercado Libre", variant: "secondary" },
  IDLE: { label: "Sin anuncios activos", variant: "outline" },
  CLOSED: { label: "Finalizada", variant: "outline" },
  DELETED: { label: "Eliminada", variant: "outline" },
};

const strategyOptions: Record<
  CampaignStrategy,
  { label: string; impact: string }
> = {
  profitability: {
    label: "Priorizar margen",
    impact:
      "Reduce alcance para buscar personas con mayor probabilidad de comprar. Puede bajar el volumen de ventas.",
  },
  increase: {
    label: "Equilibrar alcance y margen",
    impact:
      "Busca un punto medio. No garantiza un retorno ni limita el gasto por sí sola.",
  },
  visibility: {
    label: "Priorizar alcance",
    impact:
      "Aumenta la exposición de publicaciones, especialmente nuevas, con mayor riesgo de gastar sin recuperar la inversión.",
  },
};

function getErrorMessage(response: Response) {
  return response
    .json()
    .then(
      (body: { error?: string }) =>
        body.error ?? "No fue posible actualizar Product Ads",
    )
    .catch(() => "No fue posible actualizar Product Ads");
}

function formatCurrency(value: number, currencyId: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currencyId,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)}x`;
}

function getCampaignStatus(status: string | null) {
  if (!status) return { label: "Sin estado", variant: "outline" as const };

  return (
    campaignStatusLabels[status.toUpperCase()] ?? {
      label: status,
      variant: "outline" as const,
    }
  );
}

function getDailyBudget(campaign: ProductAdsCampaign) {
  return campaign.dailyBudget ?? campaign.budget;
}

function getActionTitle(action: CampaignAction) {
  if (action === "PAUSE") return "Pausar campaña";
  if (action === "ACTIVATE") return "Activar campaña";
  return "Ajustar campaña";
}

export function MercadoLibreProductAdsOverview({
  storeId,
}: {
  storeId: string;
}) {
  const [overview, setOverview] = useState<ProductAdsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dialog, setDialog] = useState<CampaignActionDialog | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const loadOverview = async (clearFeedback = true) => {
    setIsLoading(true);
    if (clearFeedback) setFeedback(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/advertising/overview`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setOverview((await response.json()) as ProductAdsOverview);
    } catch (requestError) {
      setFeedback({
        type: "error",
        message:
          requestError instanceof Error
            ? requestError.message
            : "No fue posible consultar Product Ads",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openAction = (campaign: ProductAdsCampaign, action: CampaignAction) => {
    setFeedback(null);
    setDialog({
      campaign,
      action,
      budget: getDailyBudget(campaign) ?? undefined,
      roasTarget: campaign.roasTarget ?? undefined,
      strategy: campaign.strategy,
    });
  };

  const saveAction = async () => {
    if (!dialog) return;

    const payload: Record<string, unknown> = { action: dialog.action };
    if (dialog.action === "UPDATE_SETTINGS") {
      const currentBudget = getDailyBudget(dialog.campaign);
      if (dialog.budget !== undefined && dialog.budget !== currentBudget) {
        payload.budget = dialog.budget;
      }
      if (
        dialog.roasTarget !== undefined &&
        dialog.roasTarget !== dialog.campaign.roasTarget
      ) {
        payload.roasTarget = dialog.roasTarget;
      }
      if (dialog.strategy && dialog.strategy !== dialog.campaign.strategy) {
        payload.strategy = dialog.strategy;
      }
      if (Object.keys(payload).length === 1) {
        setFeedback({
          type: "error",
          message: "No cambiaste presupuesto, ROAS objetivo ni estrategia.",
        });
        return;
      }
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/advertising/campaigns/${encodeURIComponent(dialog.campaign.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const result = (await response.json()) as { message: string };
      await loadOverview(false);
      setDialog(null);
      setFeedback({ type: "success", message: result.message });
    } catch (requestError) {
      setFeedback({
        type: "error",
        message:
          requestError instanceof Error
            ? requestError.message
            : "No fue posible actualizar la campaña",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isReady = overview?.state === "READY";
  const dialogDailyBudget = dialog ? getDailyBudget(dialog.campaign) : null;
  const dialogBudget = dialog?.budget ?? dialogDailyBudget;
  const isPausing = dialog?.action === "PAUSE";
  const isActivating = dialog?.action === "ACTIVATE";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <MercadoLibreLogo className="h-6" />
            <div>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-muted-foreground" />
                Product Ads
              </CardTitle>
              <CardDescription>
                Revisa resultados de los últimos 30 días y decide cambios de
                publicidad con impacto visible.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadOverview()}
            disabled={isLoading || isSaving}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {overview ? "Actualizar métricas" : "Consultar métricas"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="info">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Sin cambios automáticos</AlertTitle>
          <AlertDescription>
            P de Papel solo cambia una campaña cuando una persona administradora
            lo confirma. Pausar no afecta la publicación ni sus ventas
            orgánicas; activar puede volver a generar cobros por clic.
          </AlertDescription>
        </Alert>

        {feedback ? (
          <Alert
            variant={feedback.type === "error" ? "destructive" : "success"}
          >
            {feedback.type === "error" ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            <AlertTitle>
              {feedback.type === "error"
                ? "No se aplicó el cambio"
                : "Cambio confirmado"}
            </AlertTitle>
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        ) : null}

        {overview?.state === "NOT_ENABLED" ? (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Product Ads no está disponible</AlertTitle>
            <AlertDescription>{overview.message}</AlertDescription>
          </Alert>
        ) : null}

        {overview?.state === "REAUTH_REQUIRED" ? (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Se debe reconectar Mercado Libre</AlertTitle>
            <AlertDescription>{overview.message}</AlertDescription>
          </Alert>
        ) : null}

        {isReady ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <p>
                {overview.advertiser.name ?? "Cuenta anunciante"} · Del{" "}
                {overview.range.from} al {overview.range.to}
              </p>
              <Badge variant="secondary">
                {formatNumber(overview.totalCampaigns)} campañas
              </Badge>
            </div>

            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Estas cifras no son utilidad</AlertTitle>
              <AlertDescription>
                Mercado Libre atribuye ventas y gasto publicitario, pero no
                descuenta comisión, envíos, impuestos, devoluciones ni costo de
                compra. La liquidación neta de cada venta sigue siendo la fuente
                de dinero realmente recibido.
              </AlertDescription>
            </Alert>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Gasto publicitario real
                </p>
                <p className="text-lg font-semibold">
                  {formatCurrency(overview.summary.cost, overview.currencyId)}
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Ventas atribuidas por Mercado Libre
                </p>
                <p className="text-lg font-semibold">
                  {formatCurrency(
                    overview.summary.totalAmount,
                    overview.currencyId,
                  )}
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">ROAS observado</p>
                <p className="text-lg font-semibold">
                  {formatRatio(overview.summary.roas)}
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">ACOS observado</p>
                <p className="text-lg font-semibold">
                  {formatPercent(overview.summary.acos)}
                </p>
              </div>
            </div>

            {overview.campaigns.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaña</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">
                        Presupuesto diario
                      </TableHead>
                      <TableHead className="text-right">Gasto real</TableHead>
                      <TableHead className="text-right">
                        Ventas atribuidas
                      </TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.campaigns.map((campaign) => {
                      const status = getCampaignStatus(campaign.status);
                      const dailyBudget = getDailyBudget(campaign);
                      const isActive =
                        campaign.status?.toLowerCase() === "active";

                      return (
                        <TableRow key={campaign.id}>
                          <TableCell className="min-w-52 font-medium">
                            <p>{campaign.name}</p>
                            <p className="mt-1 text-xs font-normal text-muted-foreground">
                              {campaign.strategy
                                ? strategyOptions[campaign.strategy].label
                                : "Estrategia no reportada"}
                              {campaign.automaticBudget === true
                                ? " · Ajuste automático de presupuesto activo"
                                : ""}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {dailyBudget === null
                              ? "—"
                              : formatCurrency(
                                  dailyBudget,
                                  overview.currencyId,
                                )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(
                              campaign.metrics.cost,
                              overview.currencyId,
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(
                              campaign.metrics.totalAmount,
                              overview.currencyId,
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatRatio(campaign.metrics.roas)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  openAction(campaign, "UPDATE_SETTINGS")
                                }
                                disabled={isSaving}
                              >
                                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                Ajustar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={isActive ? "destructive" : "default"}
                                onClick={() =>
                                  openAction(
                                    campaign,
                                    isActive ? "PAUSE" : "ACTIVATE",
                                  )
                                }
                                disabled={isSaving}
                              >
                                {isActive ? (
                                  <Pause className="mr-1.5 h-3.5 w-3.5" />
                                ) : (
                                  <Play className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                {isActive ? "Pausar" : "Activar"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Alert>
                <BarChart3 className="h-4 w-4" />
                <AlertTitle>Todavía no hay campañas con datos</AlertTitle>
                <AlertDescription>
                  Product Ads está conectado. Cuando Mercado Libre reporte una
                  campaña o métricas, aparecerán aquí para revisión manual.
                </AlertDescription>
              </Alert>
            )}
          </>
        ) : null}
      </CardContent>

      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog ? getActionTitle(dialog.action) : ""}
            </DialogTitle>
            <DialogDescription>{dialog?.campaign.name}</DialogDescription>
          </DialogHeader>

          {dialog ? (
            <div className="space-y-4 text-sm">
              {isPausing ? (
                <Alert variant="warning">
                  <Pause className="h-4 w-4" />
                  <AlertTitle>Detiene nuevos cobros de esta campaña</AlertTitle>
                  <AlertDescription>
                    Mercado Libre dejará de mostrar estos anuncios una vez
                    confirme el cambio. No devuelve gasto ya cobrado y la
                    publicación seguirá disponible para ventas orgánicas.
                  </AlertDescription>
                </Alert>
              ) : null}

              {isActivating ? (
                <Alert variant="warning">
                  <Play className="h-4 w-4" />
                  <AlertTitle>Puede volver a generar gasto por clic</AlertTitle>
                  <AlertDescription>
                    Activar no garantiza ventas. Con el presupuesto actual, la
                    campaña tiene un promedio diario de{" "}
                    {dialogDailyBudget === null
                      ? "no reportado"
                      : formatCurrency(
                          dialogDailyBudget,
                          overview?.state === "READY"
                            ? overview.currencyId
                            : "COP",
                        )}
                    . Mercado Libre indica que un día puede usar hasta el doble
                    del promedio si compensa días anteriores con menor consumo.
                  </AlertDescription>
                </Alert>
              ) : null}

              {dialog.action === "UPDATE_SETTINGS" ? (
                <>
                  <Alert variant="info">
                    <ShieldCheck className="h-4 w-4" />
                    <AlertTitle>Revisa el riesgo antes de guardar</AlertTitle>
                    <AlertDescription>
                      Cambiar presupuesto o ROAS puede modificar alcance y gasto
                      desde el momento en que Mercado Libre acepte la acción. No
                      existe una ganancia garantizada.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-2">
                    <Label htmlFor="ads-budget">
                      Presupuesto promedio diario
                    </Label>
                    <CurrencyInput
                      id="ads-budget"
                      value={dialog.budget}
                      onChange={(budget) =>
                        setDialog((current) =>
                          current ? { ...current, budget } : null,
                        )
                      }
                      placeholder="Ej. 30000"
                    />
                    <p className="text-xs text-muted-foreground">
                      Promedio mensual de referencia:{" "}
                      {dialogBudget === null || dialogBudget === undefined
                        ? "sin presupuesto definido"
                        : formatCurrency(
                            dialogBudget * 30,
                            overview?.state === "READY"
                              ? overview.currencyId
                              : "COP",
                          )}
                      . En un día Mercado Libre puede consumir hasta{" "}
                      {dialogBudget === null || dialogBudget === undefined
                        ? "ese límite no se puede calcular"
                        : formatCurrency(
                            dialogBudget * 2,
                            overview?.state === "READY"
                              ? overview.currencyId
                              : "COP",
                          )}{" "}
                      por compensación de días previos.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="ads-roas">ROAS objetivo</Label>
                    <Input
                      id="ads-roas"
                      type="number"
                      min="1"
                      max="35"
                      step="0.1"
                      value={dialog.roasTarget ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDialog((current) =>
                          current
                            ? {
                                ...current,
                                roasTarget:
                                  value === "" ? undefined : Number(value),
                              }
                            : null,
                        );
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Más bajo busca mayor alcance y puede reducir el retorno
                      por venta. Más alto busca mayor retorno por venta y puede
                      reducir visitas y ventas atribuidas. Mercado Libre permite
                      de 1x a 35x.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label>Estrategia</Label>
                    <Select
                      value={dialog.strategy ?? undefined}
                      onValueChange={(strategy) =>
                        setDialog((current) =>
                          current
                            ? {
                                ...current,
                                strategy: strategy as CampaignStrategy,
                              }
                            : null,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una estrategia" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(strategyOptions).map(
                          ([strategy, option]) => (
                            <SelectItem key={strategy} value={strategy}>
                              {option.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    {dialog.strategy ? (
                      <p className="text-xs text-muted-foreground">
                        {strategyOptions[dialog.strategy].impact}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                En los últimos 30 días esta campaña tuvo un gasto de{" "}
                {formatCurrency(
                  dialog.campaign.metrics.cost,
                  overview?.state === "READY" ? overview.currencyId : "COP",
                )}{" "}
                y Mercado Libre atribuyó ventas por{" "}
                {formatCurrency(
                  dialog.campaign.metrics.totalAmount,
                  overview?.state === "READY" ? overview.currencyId : "COP",
                )}
                . Esta diferencia no representa utilidad porque faltan costos,
                comisiones, envíos, impuestos y devoluciones.
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={isPausing ? "destructive" : "default"}
              onClick={() => void saveAction()}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {dialog ? getActionTitle(dialog.action) : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
