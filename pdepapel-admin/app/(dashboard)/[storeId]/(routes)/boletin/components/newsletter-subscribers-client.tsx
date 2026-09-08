"use client";

import { NewsletterSubscriberStatus } from "@prisma/client";
import type { ColumnDef } from "@tanstack/react-table";
import axios from "axios";
import { Download, MailCheck, UserMinus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

import { TintBadge } from "../../pedidos/components/order-badges";
import { relativeDate } from "../../pedidos/components/columns";
import type { NewsletterSubscriberRow } from "../server/get-newsletter-subscribers";

const STATUS_COPY: Record<NewsletterSubscriberStatus, { label: string; tone: "mint" | "cream" | "slate" | "pink" }> = {
  ACTIVE: { label: "Confirmada", tone: "mint" },
  PENDING: { label: "Por confirmar", tone: "cream" },
  UNSUBSCRIBED: { label: "Cancelada", tone: "slate" },
  SUPPRESSED: { label: "Bloqueada", tone: "pink" },
};

const VIEWS = [
  { id: "confirmados", label: "Confirmados", statuses: [NewsletterSubscriberStatus.ACTIVE] },
  { id: "por-confirmar", label: "Por confirmar", statuses: [NewsletterSubscriberStatus.PENDING] },
  { id: "bajas", label: "Bajas", statuses: [NewsletterSubscriberStatus.UNSUBSCRIBED, NewsletterSubscriberStatus.SUPPRESSED] },
  { id: "todos", label: "Todos", statuses: null },
] as const;
type View = (typeof VIEWS)[number]["id"];
const VIEW_PARAM = "vista";
const DEFAULT_VIEW: View = "confirmados";

const DATE_TIME = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

interface NewsletterSubscribersClientProps {
  storeId: string;
  subscribers: NewsletterSubscriberRow[];
  counts: Record<NewsletterSubscriberStatus, number>;
  total: number;
}

export function NewsletterSubscribersClient({ storeId, subscribers, counts, total }: NewsletterSubscribersClientProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const requested = searchParams.get(VIEW_PARAM);
  const [view, setViewState] = useState<View>(VIEWS.some((item) => item.id === requested) ? (requested as View) : DEFAULT_VIEW);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [unsubscribeTarget, setUnsubscribeTarget] = useState<NewsletterSubscriberRow | null>(null);

  const setView = useCallback(
    (next: View) => {
      setViewState(next);
      const query = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_VIEW) query.delete(VIEW_PARAM);
      else query.set(VIEW_PARAM, next);
      const suffix = query.toString();
      window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
    },
    [pathname, searchParams],
  );

  const viewCounts = useMemo(() => {
    const result = {} as Record<View, number>;
    for (const item of VIEWS) result[item.id] = item.statuses ? item.statuses.reduce((sum, status) => sum + counts[status], 0) : total;
    return result;
  }, [counts, total]);
  const rows = useMemo(() => {
    const current = VIEWS.find((item) => item.id === view);
    if (!current?.statuses) return subscribers;
    const allowed: NewsletterSubscriberStatus[] = [...current.statuses];
    return subscribers.filter((subscriber) => allowed.includes(subscriber.status));
  }, [subscribers, view]);

  const runAction = useCallback(
    async (subscriber: NewsletterSubscriberRow, action: "resend_confirmation" | "unsubscribe") => {
      try {
        setBusyId(subscriber.id);
        await axios.patch(`/api/${storeId}/newsletter/subscribers/${subscriber.id}`, { action });
        toast({ variant: "success", description: action === "unsubscribe" ? "La suscripción quedó cancelada." : "Enviamos una nueva confirmación." });
        setUnsubscribeTarget(null);
        router.refresh();
      } catch (error) {
        toast({ variant: "destructive", description: getErrorMessage(error) });
      } finally {
        setBusyId(null);
      }
    },
    [router, storeId, toast],
  );

  const columns = useMemo<ColumnDef<NewsletterSubscriberRow>[]>(
    () => [
      {
        id: "email",
        accessorFn: (row) => `${row.email} ${row.source ?? ""}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Correo" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{row.original.email}</span>
            <span className="truncate text-xs text-muted-foreground">{row.original.source ? `Desde ${row.original.source}` : "Origen no registrado"}</span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
        cell: ({ row }) => {
          const copy = STATUS_COPY[row.original.status];
          return <TintBadge label={copy.label} tone={copy.tone} />;
        },
      },
      {
        accessorKey: "consentedAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Se suscribió" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground" title={DATE_TIME.format(new Date(row.original.consentedAt))}>
            {relativeDate(row.original.consentedAt)}
          </span>
        ),
      },
      {
        accessorKey: "confirmedAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Confirmó" />,
        cell: ({ row }) =>
          row.original.confirmedAt ? (
            <span className="whitespace-nowrap text-xs text-muted-foreground" title={DATE_TIME.format(new Date(row.original.confirmedAt))}>
              {relativeDate(row.original.confirmedAt)}
            </span>
          ) : row.original.unsubscribedAt ? (
            <span className="whitespace-nowrap text-xs text-muted-foreground">Baja {relativeDate(row.original.unsubscribedAt)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.original.lastConfirmationSentAt ? `Correo enviado ${relativeDate(row.original.lastConfirmationSentAt)}` : "Sin confirmar"}
            </span>
          ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <SubscriberAction
            subscriber={row.original}
            busy={busyId === row.original.id}
            onResend={() => void runAction(row.original, "resend_confirmation")}
            onUnsubscribe={() => setUnsubscribeTarget(row.original)}
          />
        ),
      },
    ],
    [busyId, runAction],
  );

  const metrics = [
    { label: "Confirmados", value: counts.ACTIVE, hint: "Se les puede escribir" },
    { label: "Por confirmar", value: counts.PENDING, hint: "No abrieron el correo de confirmación" },
    { label: "Bajas", value: counts.UNSUBSCRIBED + counts.SUPPRESSED, hint: "Cancelaron o rebotaron" },
    { label: "Registrados", value: total, hint: "Desde el formulario de la tienda" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Boletín</h1>
          <p className="text-sm text-muted-foreground">
            Personas que pidieron novedades desde la tienda. Solo las confirmadas se exportan para escribirles; el envío del boletín se hace fuera del panel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <Button asChild variant="outline">
            <a href={`/api/${storeId}/newsletter/export`}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Exportar confirmados
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", metric.label === "Confirmados" ? "text-primary" : "text-foreground")}>{metric.value}</p>
            <p className="text-xs text-muted-foreground">{metric.hint}</p>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Vistas de suscriptores" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
        {VIEWS.map((item) => {
          const active = item.id === view;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(item.id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
              )}
            >
              {item.label}
              <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>{viewCounts[item.id]}</span>
            </button>
          );
        })}
      </div>

      <DataTable
        tableKey={Models.NewsletterSubscribers}
        searchPlaceholder="Buscar correo u origen…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        renderMobileCard={(row) => {
          const copy = STATUS_COPY[row.original.status];
          return (
            <article className="flex flex-col gap-2 rounded-xl border bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-semibold">{row.original.email}</span>
                <TintBadge label={copy.label} tone={copy.tone} />
              </div>
              <p className="text-xs text-muted-foreground">
                Se suscribió {relativeDate(row.original.consentedAt)}
                {row.original.confirmedAt ? ` · confirmó ${relativeDate(row.original.confirmedAt)}` : ""}
              </p>
              <div className="flex justify-end">
                <SubscriberAction
                  subscriber={row.original}
                  busy={busyId === row.original.id}
                  onResend={() => void runAction(row.original, "resend_confirmation")}
                  onUnsubscribe={() => setUnsubscribeTarget(row.original)}
                />
              </div>
            </article>
          );
        }}
        emptyState={
          view === "todos"
            ? { title: "Aún no hay suscriptores", description: "Cuando alguien se suscriba desde la tienda aparecerá aquí." }
            : { title: "Nada en esta vista", description: "Cambia de vista o espera nuevas suscripciones." }
        }
      />

      <AlertDialog open={unsubscribeTarget !== null} onOpenChange={(open) => !open && setUnsubscribeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja a {unsubscribeTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Dejará de recibir el boletín. Si vuelve a suscribirse desde la tienda, tendrá que confirmar de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId !== null}
              onClick={() => unsubscribeTarget && void runAction(unsubscribeTarget, "unsubscribe")}
            >
              Sí, dar de baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SubscriberAction({
  subscriber,
  busy,
  onResend,
  onUnsubscribe,
}: {
  subscriber: NewsletterSubscriberRow;
  busy: boolean;
  onResend: () => void;
  onUnsubscribe: () => void;
}) {
  if (subscriber.status === NewsletterSubscriberStatus.SUPPRESSED || subscriber.status === NewsletterSubscriberStatus.UNSUBSCRIBED) {
    return <span className="text-xs text-muted-foreground">Sin acciones</span>;
  }
  if (subscriber.status === NewsletterSubscriberStatus.ACTIVE) {
    return (
      <Button type="button" variant="outline" size="sm" isLoading={busy} onClick={(event) => { event.stopPropagation(); onUnsubscribe(); }}>
        {!busy && <UserMinus className="mr-2 h-4 w-4" aria-hidden="true" />}
        Dar de baja
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" isLoading={busy} onClick={(event) => { event.stopPropagation(); onResend(); }}>
      {!busy && <MailCheck className="mr-2 h-4 w-4" aria-hidden="true" />}
      Reenviar confirmación
    </Button>
  );
}
