"use client";

import axios from "axios";
import { ProductPresaleStatus } from "@prisma/client";
import { AlertTriangle, BellRing, PackageCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { PRESALE_STATUS_LABELS } from "@/lib/presale";
import { formatAvailableAt } from "@/lib/product-availability";
import { currencyFormatter } from "@/lib/utils";
import type { PresaleRow, PresalesSummary } from "../server/get-presales";

const STATUS_VARIANT: Record<
  ProductPresaleStatus,
  "default" | "secondary" | "success"
> = {
  [ProductPresaleStatus.ACTIVE]: "default",
  [ProductPresaleStatus.RELEASED]: "success",
  [ProductPresaleStatus.CANCELLED]: "secondary",
};

/**
 * Preventas: lo que ya se cobró y todavía no se ha despachado.
 *
 * Dos acciones, y solo dos. «Liberar» cuando llega la mercancía, y «Notificar
 * retraso» cuando la fecha se cae. Las devoluciones de dinero se hacen a mano
 * en Bold o Wompi: el panel no mueve plata.
 */
const PresalesClient: React.FC<{ data: PresalesSummary }> = ({ data }) => {
  // El servidor ya manda las filas sin el dinero recibido; aquí se quitan la
  // tarjeta, la cifra por fila y las dos acciones que mueven inventario.
  const canWrite = useCanWrite();
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [loading, setLoading] = useState<string | null>(null);
  const storeId = String(params.storeId);

  const onRelease = async (row: PresaleRow) => {
    const confirmed = await requestConfirmation({
      title: `¿Liberar «${row.productName}»?`,
      description:
        `Se van a descontar ${row.pendingUnits} unidades del inventario y ${row.customerCount} pedido(s) quedarán listos para despachar. ` +
        "Esto no se puede deshacer solo.",
      confirmLabel: "Liberar",
    });
    if (!confirmed) return;

    try {
      setLoading(row.id);
      const { data: result } = await axios.post(
        `/api/${storeId}/presales/${row.id}/release`,
      );
      router.refresh();
      toast({
        title: "Preventa liberada",
        description:
          result.stillHeldOrderIds?.length > 0
            ? `${result.releasedOrderIds.length} pedido(s) listos. ${result.stillHeldOrderIds.length} siguen esperando otra preventa.`
            : `${result.releasedOrderIds.length} pedido(s) ya se pueden despachar.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No se pudo liberar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const onNotifyDelay = async (row: PresaleRow) => {
    const confirmed = await requestConfirmation({
      title: `¿Avisar del retraso de «${row.productName}»?`,
      description:
        `Se le escribe a ${row.customerCount} clienta(s) para decirles que la fecha se movió, sin prometer una nueva. ` +
        "Queda anotado que tú avisaste hoy. Las devoluciones de dinero se hacen a mano en Bold o Wompi.",
      confirmLabel: "Avisar",
    });
    if (!confirmed) return;

    try {
      setLoading(row.id);
      const { data: result } = await axios.post(
        `/api/${storeId}/presales/${row.id}/notify-delay`,
      );
      router.refresh();
      toast({
        title: "Aviso enviado",
        description: `Se le avisó a ${result.notified} clienta(s). Queda registrado.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No se pudo avisar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      {confirmationDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading
          title={`Preventas (${data.rows.filter((row) => row.status === ProductPresaleStatus.ACTIVE).length} activas)`}
          description="Lo que ya cobraste y todavía no has despachado. Cuando llegue la mercancía, libera aquí y los pedidos entran al despacho normal."
        />
        {data.overdueCount > 0 ? (
          <Badge variant="destructive" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {data.overdueCount === 1
              ? "1 fecha vencida"
              : `${data.overdueCount} fechas vencidas`}
          </Badge>
        ) : null}
      </div>
      <Separator />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Unidades por entregar
            </p>
            <p className="text-2xl font-bold tracking-tight">
              {data.activeUnits}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.customerCount} clienta{data.customerCount === 1 ? "" : "s"}{" "}
              esperando
            </p>
          </CardContent>
        </Card>
        {canWrite ? (
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Dinero ya recibido
            </p>
            <p className="text-2xl font-bold tracking-tight">
              {currencyFormatter(data.collected)}
            </p>
            <p className="text-xs text-muted-foreground">
              pendiente de entregar
            </p>
          </CardContent>
        </Card>
        ) : null}
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Próxima entrega prometida
            </p>
            <p className="text-2xl font-bold tracking-tight">
              {data.nextArrivalAt ? formatAvailableAt(data.nextArrivalAt) : "—"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {data.nextArrivalProduct ?? "Nada pendiente"}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.rows.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Todavía no hay preventas.
            </p>
            <p>
              Una preventa se abre desde el producto, en la sección «Preventa».
              Sirve para cobrar hoy algo que llega después, y para saber cuántas
              unidades pedirle a tu proveedora.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.rows.map((row) => (
            <li key={row.id}>
              <Card
                className={row.isOverdue ? "border-destructive/50" : undefined}
              >
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-1.5">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {row.productName}
                      <Badge variant={STATUS_VARIANT[row.status]}>
                        {PRESALE_STATUS_LABELS[row.status]}
                      </Badge>
                      {row.isOverdue ? (
                        <Badge variant="destructive">
                          Vencida · prometida el{" "}
                          {formatAvailableAt(row.expectedArrivalAt)}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.productSku ?? "sin SKU"} · llega el{" "}
                      {formatAvailableAt(row.expectedArrivalAt)}
                    </p>
                    <p className="text-sm">
                      <strong>{row.committedUnits}</strong> de {row.unitLimit}{" "}
                      reservadas · {row.customerCount} clienta
                      {row.customerCount === 1 ? "" : "s"}
                      {canWrite ? (
                        <>
                          {" · "}
                          <strong>{currencyFormatter(row.collected)}</strong>
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.pendingUnits > 0
                        ? `Faltan ${row.pendingUnits} unidades por entregar · hay ${row.productStock} en bodega`
                        : "Todo entregado"}
                    </p>
                    {/* El contador se suma al confirmarse el pago y, si ese
                        apunte falla, el pago sigue igual: la plata ya entró.
                        Aquí se nota, contando los pedidos pagados uno por uno,
                        para que el descuadre no viva solo en los registros. */}
                    {row.heldUnits > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {row.heldUnits} apartada{row.heldUnits === 1 ? "" : "s"}{" "}
                        en pedidos sin pagar todavía
                      </p>
                    ) : null}
                    {row.overCapUnits > 0 ? (
                      <p className="text-xs font-medium text-destructive">
                        Se vendieron {row.overCapUnits} por encima del tope: hay{" "}
                        {row.paidUnits} pagadas y el tope era {row.unitLimit}.
                      </p>
                    ) : null}
                    {row.counterDrift !== 0 ? (
                      <p className="text-xs font-medium text-destructive">
                        Contador descuadrado: hay {row.paidUnits} unidades
                        pagadas y el cupo dice {row.committedUnits}. Manda lo
                        pagado.
                      </p>
                    ) : null}
                    {row.delayNotifiedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Retraso avisado el{" "}
                        {formatAvailableAt(row.delayNotifiedAt)}
                      </p>
                    ) : row.isOverdue ? (
                      <p className="text-xs font-medium text-destructive">
                        Sin avisar a las {row.customerCount} clientas
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {canWrite && row.isOverdue ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={loading !== null}
                        onClick={() => onNotifyDelay(row)}
                      >
                        <BellRing className="mr-2 h-4 w-4" aria-hidden="true" />
                        Notificar retraso
                      </Button>
                    ) : null}
                    {canWrite && row.status === ProductPresaleStatus.ACTIVE ? (
                      <Button
                        size="sm"
                        disabled={loading !== null || !row.canRelease}
                        title={
                          row.canRelease
                            ? undefined
                            : `Necesitas ${row.pendingUnits} unidades en bodega y hay ${row.productStock}`
                        }
                        onClick={() => onRelease(row)}
                      >
                        <PackageCheck
                          className="mr-2 h-4 w-4"
                          aria-hidden="true"
                        />
                        Liberar
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        <strong>Liberar</strong> descuenta el inventario de esas unidades con su
        movimiento y suelta los pedidos al despacho normal. Un pedido con
        preventa espera completo, también lo que ya estaba en bodega: nunca se
        parte un envío.{" "}
        <strong>Las devoluciones de dinero se hacen a mano</strong> en Bold o
        Wompi, como cualquier otra.
      </p>
    </>
  );
};

export default PresalesClient;
