"use client";

import axios from "axios";
import { MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { PROMOTION_STATUS, formatDiscount, getPromotionStatus, summarizePromotions, type PromotionStatus } from "@/lib/promotion-status";
import { cn, currencyFormatter } from "@/lib/utils";

import { CouponBatchDialog } from "../../cupones/components/coupon-batch-dialog";
import { CellAction as CouponCellAction } from "../../cupones/components/cell-action";
import { buildCouponColumns, CouponStatusBadge, type CouponColumn } from "../../cupones/components/columns";
import { CellAction as OfferCellAction } from "../../ofertas/components/cell-action";
import { buildOfferColumns, offerScope, OfferStatusBadge, type OfferColumn } from "../../ofertas/components/columns";

type PromotionsPanelProps = { kind: "ofertas"; data: OfferColumn[] } | { kind: "cupones"; data: CouponColumn[] };

const SHORT_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });

const STATUS_FILTER = (Object.keys(PROMOTION_STATUS) as PromotionStatus[]).map((status) => ({ label: PROMOTION_STATUS[status].label, value: status }));

const COPY = {
  ofertas: {
    newLabel: "Nueva oferta",
    newHref: "ofertas/nuevo",
    model: Models.Offers,
    search: "Buscar oferta o etiqueta…",
    empty: { title: "Aún no hay ofertas", description: "Una oferta rebaja el precio de productos, categorías o grupos durante un periodo y se ve en la tienda." },
  },
  cupones: {
    newLabel: "Nuevo cupón",
    newHref: "cupones/nuevo",
    model: Models.Coupons,
    search: "Buscar código…",
    empty: { title: "Aún no hay cupones", description: "Un cupón es un código que la persona escribe al pagar; puedes limitar usos y monto mínimo." },
  },
} as const;

export function PromotionsPanel(props: PromotionsPanelProps) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const copy = COPY[props.kind];
  const [validating, setValidating] = useState(false);

  const summary = useMemo(() => summarizePromotions(props.data.map((item) => getPromotionStatus(item))), [props.data]);
  const offerColumns = useMemo(() => buildOfferColumns(storeId), [storeId]);
  const couponColumns = useMemo(() => buildCouponColumns(storeId), [storeId]);

  const updateValidity = async () => {
    try {
      setValidating(true);
      const response = await axios.post<{ message: string }>(`/api/${storeId}/${copy.model}/update-validity`);
      router.refresh();
      toast({ description: response.data.message, variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  const metrics = [
    { label: "Vigentes", value: summary.vigentes, hint: "Aplican hoy en la tienda" },
    { label: "Programadas", value: summary.programadas, hint: "Empiezan más adelante" },
    ...(props.kind === "cupones" ? [{ label: "Agotadas", value: summary.agotadas, hint: "Sin usos disponibles" }] : []),
    { label: "Vencidas", value: summary.vencidas, hint: "Ya terminaron" },
    { label: "Desactivadas", value: summary.desactivadas, hint: "Apagadas a mano" },
  ];
  const statusFilter = STATUS_FILTER.filter((option) => props.kind === "cupones" || option.value !== "agotada");

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("grid gap-3 sm:grid-cols-2", metrics.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", metric.label === "Vigentes" ? "text-primary" : "text-foreground")}>{metric.value}</p>
            <p className="text-xs text-muted-foreground">{metric.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <RefreshButton />
        {props.kind === "cupones" && <CouponBatchDialog />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Más acciones">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => void updateValidity()} disabled={validating}>
              <RefreshCw className={cn("mr-2 h-4 w-4", validating && "animate-spin")} aria-hidden="true" />
              Recalcular vigencias ahora
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button asChild>
          <Link href={`/${storeId}/${copy.newHref}`}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {copy.newLabel}
          </Link>
        </Button>
      </div>

      {props.kind === "ofertas" ? (
        <DataTable
          tableKey={Models.Offers}
          searchPlaceholder={copy.search}
          columns={offerColumns}
          data={props.data}
          getRowId={(row) => row.id}
          onRowClick={(row) => router.push(`/${storeId}/ofertas/${row.id}`)}
          filters={[{ columnKey: "status", title: "Estado", options: statusFilter }]}
          renderMobileCard={(row) => (
            <article className="flex flex-col gap-2 rounded-xl border bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/${storeId}/ofertas/${row.original.id}`} className="truncate text-sm font-bold text-primary">
                  {row.original.name}
                </Link>
                <OfferStatusBadge offer={row.original} />
              </div>
              <p className="text-sm">
                <span className="font-semibold">{formatDiscount(row.original.type, row.original.amount, currencyFormatter)}</span>
                <span className="text-muted-foreground"> · {offerScope(row.original)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {SHORT_DATE.format(new Date(row.original.startDate))} – {SHORT_DATE.format(new Date(row.original.endDate))}
              </p>
              <div className="flex items-center justify-end">
                <OfferCellAction data={row.original} />
              </div>
            </article>
          )}
          emptyState={{ ...copy.empty, action: <Button asChild><Link href={`/${storeId}/${copy.newHref}`}>{copy.newLabel}</Link></Button> }}
        />
      ) : (
        <DataTable
          tableKey={Models.Coupons}
          searchPlaceholder={copy.search}
          columns={couponColumns}
          data={props.data}
          getRowId={(row) => row.id}
          onRowClick={(row) => router.push(`/${storeId}/cupones/${row.id}`)}
          filters={[{ columnKey: "status", title: "Estado", options: statusFilter }]}
          renderMobileCard={(row) => (
            <article className="flex flex-col gap-2 rounded-xl border bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/${storeId}/cupones/${row.original.id}`} className="font-mono text-sm font-bold text-primary">
                  {row.original.code}
                </Link>
                <CouponStatusBadge coupon={row.original} />
              </div>
              <p className="text-sm">
                <span className="font-semibold">{formatDiscount(row.original.type, row.original.amount, currencyFormatter)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {row.original.usedCount} de {row.original.maxUses ?? "∞"} usos
                </span>
              </p>
              <div className="flex items-center justify-end">
                <CouponCellAction data={row.original} />
              </div>
            </article>
          )}
          emptyState={{ ...copy.empty, action: <Button asChild><Link href={`/${storeId}/${copy.newHref}`}>{copy.newLabel}</Link></Button> }}
        />
      )}
    </div>
  );
}
