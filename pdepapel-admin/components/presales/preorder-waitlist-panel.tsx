"use client";

import axios from "axios";
import { MessageCircle } from "lucide-react";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import useSWR from "swr";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { formatPhoneNumber } from "@/lib/phone";
import {
  emptyWaitlistCounts,
  PANEL_WAITLIST_CHANNELS,
  splitWaitlistContact,
  WAITLIST_CHANNEL_LABELS,
  waitlistWhatsappLink,
  type PanelWaitlistChannel,
  type WaitlistEntryRow,
  type WaitlistResponse,
  type WaitlistStatus,
} from "@/lib/preorder-waitlist-shared";
import { cn } from "@/lib/utils";

export interface PreorderWaitlistPanelProps {
  storeId: string;
  productId: string;
  presaleId?: string | null;
  /** Hueco para «Marcar anticipo recibido»; se pinta en cada fila que no esté descartada ni convertida. */
  renderDepositAction?: (entry: WaitlistEntryRow) => ReactNode;
}

const STATUS_LABELS: Record<WaitlistStatus, string> = {
  WAITING: "Esperando",
  CONTACTED: "Contactada",
  CONVERTED: "Con anticipo",
  DISCARDED: "Descartada",
};

const STATUS_CLASSES: Record<WaitlistStatus, string> = {
  WAITING: "bg-amber-100 text-amber-900",
  CONTACTED: "bg-sky-100 text-sky-900",
  CONVERTED: "bg-emerald-100 text-emerald-900",
  DISCARDED: "bg-muted text-muted-foreground",
};

const fetcher = (url: string) => axios.get<WaitlistResponse>(url).then((response) => response.data);

const dateFormatter = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });

function contactLine(entry: WaitlistEntryRow): string | null {
  if (entry.phone) return formatPhoneNumber(entry.phone);
  if (entry.handle) return `@${entry.handle}`;
  if (entry.email) return entry.email;
  return null;
}

export function PreorderWaitlistPanel({ storeId, productId, presaleId, renderDepositAction }: PreorderWaitlistPanelProps) {
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const formId = useId();
  const url = `/api/${storeId}/preorder-waitlist?productId=${encodeURIComponent(productId)}`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });

  const [name, setName] = useState("");
  const [channel, setChannel] = useState<PanelWaitlistChannel>("WHATSAPP");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showDiscarded, setShowDiscarded] = useState(false);

  const counts = data?.counts ?? emptyWaitlistCounts();
  const entries = data?.entries ?? [];
  const visible = showDiscarded ? entries : entries.filter((entry) => entry.status !== "DISCARDED");

  // Sin <form> propio: el panel vive dentro del <form> de la ficha, y un form
  // anidado lo descarta el navegador (HTML del servidor) o React lo deja enviar
  // la ficha. «Agregar» y Enter llaman a `add` directamente.
  const add = async () => {
    if (saving) return;
    if (!name.trim()) {
      toast({ description: "Escribe el nombre.", variant: "destructive" });
      return;
    }
    if (!contact.trim()) {
      toast({ description: "Escribe un teléfono o un @usuario.", variant: "destructive" });
      return;
    }
    try {
      setSaving(true);
      const response = await axios.post<{ duplicate: boolean }>(`/api/${storeId}/preorder-waitlist`, {
        productId,
        name,
        channel,
        note,
        ...splitWaitlistContact(contact),
      });
      setName("");
      setContact("");
      setNote("");
      toast({
        description: response.data.duplicate ? "Ya estaba en la lista; no se duplicó." : "Agregada a la lista de espera.",
        variant: "success",
      });
      await mutate();
    } catch (failure) {
      toast({ title: "No se pudo agregar", description: getErrorMessage(failure), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addOnEnter = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void add();
  };

  const setStatus = async (entry: WaitlistEntryRow, status: Exclude<WaitlistStatus, "CONVERTED">) => {
    try {
      setBusyId(entry.id);
      await axios.patch(`/api/${storeId}/preorder-waitlist/${entry.id}`, { status });
      await mutate();
    } catch (failure) {
      toast({ title: "No se pudo cambiar el estado", description: getErrorMessage(failure), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby={`${formId}-title`} className="space-y-4" data-presale-id={presaleId ?? undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${formId}-title`} className="text-base font-semibold">
          Lista de espera
        </h3>
        <p className="text-xs text-muted-foreground">Nadie recibe mensajes automáticos: el contacto es a mano.</p>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {(
          [
            ["WAITING", "Esperando"],
            ["CONTACTED", "Contactadas"],
            ["CONVERTED", "Con anticipo"],
          ] as const
        ).map(([status, label]) => (
          <div key={status} className="rounded-lg border bg-card px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{counts[status]}</dd>
          </div>
        ))}
      </dl>

      {canWrite ? (
        <div role="group" aria-label="Agregar a la lista de espera" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-end">
          <div className="space-y-1">
            <label htmlFor={`${formId}-name`} className="text-xs font-medium">
              Nombre
            </label>
            <Input id={`${formId}-name`} onKeyDown={addOnEnter} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="h-11" autoComplete="off" disabled={saving} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-channel`} className="text-xs font-medium">
              Canal
            </label>
            <select
              id={`${formId}-channel`}
              value={channel}
              onChange={(event) => setChannel(event.target.value as PanelWaitlistChannel)}
              disabled={saving}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PANEL_WAITLIST_CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {WAITLIST_CHANNEL_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-contact`} className="text-xs font-medium">
              Teléfono o @usuario
            </label>
            <Input id={`${formId}-contact`} onKeyDown={addOnEnter} value={contact} onChange={(event) => setContact(event.target.value)} maxLength={80} className="h-11" autoComplete="off" disabled={saving} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-note`} className="text-xs font-medium">
              Nota (opcional)
            </label>
            <Input id={`${formId}-note`} onKeyDown={addOnEnter} value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} className="h-11" autoComplete="off" disabled={saving} />
          </div>
          <Button type="button" className="h-11 sm:col-span-2 lg:col-span-1" disabled={saving} onClick={() => void add()}>
            {saving ? "Agregando…" : "Agregar"}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudo cargar la lista de espera.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando lista de espera…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay nadie en la lista de espera.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {visible.map((entry) => {
            const line = contactLine(entry);
            const busy = busyId === entry.id;
            const open = entry.status === "WAITING" || entry.status === "CONTACTED";
            return (
              <li key={entry.id} className="flex flex-col gap-2 px-3 py-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{entry.name ?? "Persona en espera"}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASSES[entry.status])}>
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {WAITLIST_CHANNEL_LABELS[entry.channel]} · {dateFormatter.format(new Date(entry.createdAt))}
                    {line ? ` · ${line}` : ""}
                  </p>
                  {entry.note ? <p className="text-xs text-muted-foreground">{entry.note}</p> : null}
                </div>
                {canWrite ? (
                  <div className="flex flex-wrap gap-2">
                    {entry.phone ? (
                      <Button asChild variant="soft" className="h-11">
                        <a href={waitlistWhatsappLink(entry.phone)} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="h-4 w-4" aria-hidden="true" />
                          WhatsApp
                        </a>
                      </Button>
                    ) : null}
                    {entry.status === "WAITING" ? (
                      <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => setStatus(entry, "CONTACTED")}>
                        Marcar contactada
                      </Button>
                    ) : null}
                    {open ? (
                      <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={() => setStatus(entry, "DISCARDED")}>
                        Descartar
                      </Button>
                    ) : null}
                    {entry.status === "CONTACTED" || entry.status === "DISCARDED" ? (
                      <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={() => setStatus(entry, "WAITING")}>
                        Reabrir
                      </Button>
                    ) : null}
                    {open && renderDepositAction ? renderDepositAction(entry) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {counts.DISCARDED > 0 ? (
        <Button type="button" variant="link" className="h-11 px-0" onClick={() => setShowDiscarded((value) => !value)}>
          {showDiscarded ? "Ocultar descartadas" : `Ver descartadas (${counts.DISCARDED})`}
        </Button>
      ) : null}
    </section>
  );
}

export default PreorderWaitlistPanel;
