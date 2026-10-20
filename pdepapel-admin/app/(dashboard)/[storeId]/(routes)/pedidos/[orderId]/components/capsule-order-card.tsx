import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderCapsuleSection } from "@/lib/capsule-order-section";
import { currencyFormatter } from "@/lib/utils";

const CONSENT_LABEL: Record<string, string> = {
  NONE: "Sin respuesta: no se publica",
  PRIVATE: "Solo para ella: no se publica",
  PUBLIC_FIRST_NAME: "Se puede publicar con su primer nombre",
};
const VIDEO_LABEL: Record<string, string> = { POR_ABRIR: "Por abrir", GRABADO: "Grabado", ENVIADO: "Enviado", PUBLICADO: "Publicado" };

/** El pack de cápsulas del pedido. Los costos solo llegan si quien mira es la dueña. */
export function CapsuleOrderCard({ storeId, orderId, capsule }: { storeId: string; orderId: string; capsule: OrderCapsuleSection }) {
  const draw = capsule.drawCompletedAt
    ? "Sorteo cerrado"
    : capsule.slipsDrawn > 0
      ? `Sacando: ${capsule.slipsDrawn} de ${capsule.packSize} papeles`
      : "Por sacar";
  const costs = "provisionalCost" in capsule ? (capsule as { provisionalCost: number | null; realCost: number | null }) : null;
  return (
    <Card data-testid="capsula-del-pedido">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">
          Cápsulas · Edición #{capsule.editionNumber} {capsule.editionName}
        </CardTitle>
        <Badge variant={capsule.drawCompletedAt ? "default" : "secondary"}>{draw}</Badge>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted-foreground">Pack: </span>
          {capsule.packSize} cápsulas{capsule.giftLabel ? ` + ${capsule.giftLabel}` : ""}
        </p>
        <p>
          <span className="text-muted-foreground">Video: </span>
          {CONSENT_LABEL[capsule.videoConsent] ?? capsule.videoConsent} · {VIDEO_LABEL[capsule.videoStatus] ?? capsule.videoStatus}
        </p>
        <p>
          <span className="text-muted-foreground">Cupo del día: </span>
          {capsule.slot ? `${capsule.slot.day} · cupo ${capsule.slot.number} · ${capsule.slot.status === "CONFIRMED" ? "confirmado" : "apartado sin pagar"}` : "sin cupo (apartado vencido o liberado)"}
        </p>
        {capsule.suggestedBox && (
          <p>
            <span className="text-muted-foreground">Caja sugerida: </span>
            {capsule.suggestedBox}
          </p>
        )}
        {costs && (
          <p>
            <span className="text-muted-foreground">Costo: </span>
            {costs.realCost !== null
              ? `real ${currencyFormatter(costs.realCost)} (provisional ${currencyFormatter(costs.provisionalCost ?? 0)})`
              : costs.provisionalCost !== null
                ? `provisional ${currencyFormatter(costs.provisionalCost)}`
                : "se congela al pagar"}
          </p>
        )}
        {capsule.products.length > 0 && (
          <div className="sm:col-span-2">
            <p className="text-muted-foreground">Lo que salió</p>
            <ul className="list-inside list-disc">
              {capsule.products.map((product, index) => (
                <li key={`${product.name}-${index}`}>
                  {product.name}
                  {product.gift ? " (regalo)" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link className="inline-flex min-h-[44px] items-center font-medium text-primary underline-offset-4 hover:underline sm:col-span-2" href={`/${storeId}/productos/ediciones/sacar?pedido=${orderId}`}>
          Abrir en «Sacar cápsulas»
        </Link>
      </CardContent>
    </Card>
  );
}
