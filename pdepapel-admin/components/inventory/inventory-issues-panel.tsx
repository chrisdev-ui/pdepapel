"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { isExternalIssueReference } from "@/lib/fair-issue-reference";
import type { OpenInventoryIssue } from "@/lib/order-inventory-issues";
import axios from "axios";
import { PackageX, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface InventoryIssuesPanelProps {
  storeId: string;
  issues: OpenInventoryIssue[];
  /** En la página del pedido no hace falta repetir el número de pedido. */
  showOrder?: boolean;
  className?: string;
}

const fmt = (value: Date | string) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(value));

/**
 * Líneas de inventario que no se movieron cuando el pedido cambió de estado.
 * Dos salidas por fila: reintentar el movimiento (si ya hay stock o el
 * producto existe otra vez) o darla por conciliada tras un conteo físico.
 */
export function InventoryIssuesPanel({
  storeId,
  issues,
  showOrder = false,
  className,
}: InventoryIssuesPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (issues.length === 0) return null;

  const act = async (
    issue: OpenInventoryIssue,
    action: "retry" | "resolve",
  ) => {
    setBusy(`${issue.id}:${action}`);
    try {
      await axios.post(`/api/${storeId}/orders/inventory-issues/${issue.id}`, {
        action,
      });
      toast({
        description:
          action === "retry"
            ? `Movimiento creado para ${issue.productName}.`
            : `${issue.productName} marcado como conciliado.`,
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast({
        title:
          action === "retry" ? "El reintento falló" : "No se pudo conciliar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div id="incidencias-inventario" className={className}>
      <div className="flex items-start gap-3 rounded-lg border border-tint-pink bg-tint-pink/30 p-3">
        <PackageX
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-semibold text-primary">
            {issues.length === 1
              ? "1 línea de inventario sin cuadrar"
              : `${issues.length} líneas de inventario sin cuadrar`}
          </p>
          <p className="text-xs text-primary/80">
            El pedido siguió adelante pero estas unidades no se movieron en el
            kardex. Reintenta cuando haya stock o, si ya contaste la bodega,
            márcalas como conciliadas.
          </p>
        </div>
      </div>
      <ul className="mt-2 divide-y rounded-lg border bg-white">
        {issues.map((issue) => {
          const retrying = busy === `${issue.id}:retry`;
          const resolving = busy === `${issue.id}:resolve`;
          return (
            <li
              key={issue.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-primary">
                  {issue.kind === "DECREMENT"
                    ? "Faltó descontar"
                    : "Faltó devolver"}{" "}
                  {issue.quantity} × {issue.productName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {issue.reason} · {fmt(issue.createdAt)}
                  {showOrder && (
                    <>
                      {" · "}
                      {issue.orderId ? (
                        <Link
                          href={`/${storeId}/pedidos/${issue.orderId}`}
                          className="underline underline-offset-2"
                        >
                          {issue.orderNumber}
                        </Link>
                      ) : (
                        <span>
                          {issue.orderNumber}
                          {isExternalIssueReference(issue.orderNumber)
                            ? ""
                            : " (pedido eliminado)"}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="soft"
                  disabled={busy !== null}
                  isLoading={retrying}
                  loadingText="Reintentando…"
                  onClick={() => act(issue, "retry")}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reintentar
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busy !== null}
                  isLoading={resolving}
                  loadingText="Guardando…"
                  onClick={() => act(issue, "resolve")}
                >
                  Marcar como conciliado
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
