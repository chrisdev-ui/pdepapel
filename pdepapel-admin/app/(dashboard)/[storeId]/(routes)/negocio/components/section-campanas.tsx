import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionCard } from "@/components/ui/section-card";
import type { BusinessGrowthOverview } from "@/lib/business-growth-data";
import { currencyFormatter } from "@/lib/utils";
import { ExternalLink, Lightbulb, Megaphone } from "lucide-react";

import { CAMPAIGN_STATE, CAMPAIGN_STATUS } from "./business-growth-labels";

/**
 * «Campañas actuales»: recomendaciones del mes y los borradores guardados.
 * Solo pinta; el estado y las llamadas viven en `client.tsx`.
 */
export function SectionCampanas({
  overview,
  onPrepareDraft,
  onUpdateStatus,
  onCopyLink,
}: {
  overview: BusinessGrowthOverview;
  onPrepareDraft: (
    recommendation: BusinessGrowthOverview["campaignRecommendations"][number],
  ) => void;
  onUpdateStatus: (
    campaignId: string,
    status: "READY" | "PAUSED" | "COMPLETED" | "ARCHIVED",
  ) => void;
  onCopyLink: (
    campaign: BusinessGrowthOverview["campaigns"][number],
  ) => void;
}) {
  return (
    <>
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
                {/*
                  El enlace medible lleva UTM: 1.052 px de una sola
                  palabra. Tenía `truncate`, pero dentro de una fila flex
                  sin `min-w-0` el navegador reserva el ancho entero
                  igual y el recorte no llega a pasar nunca: la tarjeta
                  empujaba la pantalla a 768 y 820. La vista solo era
                  alcanzable pulsando la sub-pestaña, así que ninguna
                  medición la había visto.
                */}
                <div className="flex min-w-0 flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span className="shrink-0">
                    Presupuesto de prueba:{" "}
                    {currencyFormatter(recommendation.suggestedBudget)}
                  </span>
                  <span className="min-w-0 truncate">
                    {recommendation.landingPath}
                  </span>
                </div>
                <Button
                  variant={
                    recommendation.state === "HOLD"
                      ? "outline"
                      : "default"
                  }
                  onClick={() => onPrepareDraft(recommendation)}
                >
                  <Lightbulb className="mr-2 h-4 w-4" />
                  Preparar borrador
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SectionCard
        id="borradores-campanas"
        title="Borradores y seguimiento interno"
        description="Ideas guardadas con su enlace medible. Nada de esto publica ni gasta."
      >
        <div>
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
                      onClick={() => onCopyLink(campaign)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Copiar enlace
                    </Button>
                    {campaign.status === "DRAFT" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          onUpdateStatus(campaign.id, "READY")
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
                          onUpdateStatus(campaign.id, "ARCHIVED")
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
        </div>
      </SectionCard>

      <SectionCard
        id="conexiones-sociales"
        title="Conexiones de Instagram y TikTok"
        description="Todavía no están conectadas. Esto es lo que va a pasar cuando lo estén."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        </div>
      </SectionCard>
    </>
  );
}
