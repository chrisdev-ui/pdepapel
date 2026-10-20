"use client";

import axios from "axios";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { CapsuleQueueRow, PendingTransferCapsuleRow } from "@/lib/capsule-orders";
import { currencyFormatter } from "@/lib/utils";

const ContinuousBarcodeScanner = dynamic(() => import("@/components/ui/continuous-barcode-scanner").then((mod) => mod.ContinuousBarcodeScanner), { ssr: false });

interface DrawDetail extends CapsuleQueueRow {
  giftMaxCost: number;
  drawn: { id: string; code: string; kind: "SLIP" | "GIFT"; productName: string; unitCost: number }[];
  giftOptions: { code: string; productName: string; unitCost: number }[];
}

const VIDEO_STEPS = [
  { status: "POR_ABRIR", label: "Por abrir" },
  { status: "GRABADO", label: "Grabado" },
  { status: "ENVIADO", label: "Enviado" },
  { status: "PUBLICADO", label: "Publicado" },
] as const;

const CONSENT_LABEL: Record<string, string> = {
  NONE: "Sin respuesta: no se publica",
  PRIVATE: "Solo para ella: no se publica",
  PUBLIC_FIRST_NAME: "Se puede publicar con su primer nombre",
};

/**
 * La cola de Paula: pedidos de cápsulas por sacar y, ya cerrados, su video.
 * El código del papel se escribe en un campo de verdad (el lector o la
 * cámara solo lo llenan): así funciona con lector de barras, con la cámara
 * del celular o a mano.
 */
type DayStatus = { day: string; cap: number; used: number; left: number; opensAt: string; closedReason: "before-open" | "full" | null };

export function CapsuleQueue({
  orders: initialOrders,
  boxes,
  initialOrderId = null,
  day: initialDay = null,
  pendingTransfers = [],
}: {
  orders: CapsuleQueueRow[];
  pendingTransfers?: PendingTransferCapsuleRow[];
  boxes: { name: string; type: string; isDefault: boolean }[];
  initialOrderId?: string | null;
  day?: DayStatus | null;
}) {
  const params = useParams<{ storeId: string }>();
  // La cola se vuelve a pedir a la API en vez de refrescar la página: `productos/loading.tsx` la volvería a montar y se perdería el pedido abierto.
  const [orders, setOrders] = useState(initialOrders);
  const { toast } = useToast();
  // Desde el pedido («Abrir en Sacar cápsulas») llega abierto, en su pestaña.
  const linked = initialOrders.find((order) => order.orderId === initialOrderId) ?? null;
  const [tab, setTab] = useState<"sacar" | "videos">(linked?.drawCompletedAt ? "videos" : "sacar");
  const [selected, setSelected] = useState<string | null>(linked?.orderId ?? null);
  const [detail, setDetail] = useState<DrawDetail | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);

  const toDraw = orders.filter((order) => !order.drawCompletedAt);
  const drawnOrders = orders.filter((order) => order.drawCompletedAt);
  const boxName = (type: string | null) => (type ? (boxes.find((box) => box.type === type && box.isDefault) ?? boxes.find((box) => box.type === type))?.name ?? `Caja ${type}` : "—");

  const load = useCallback(
    async (orderId: string) => {
      const { data } = await axios.get(`/api/${params.storeId}/capsule-orders/${orderId}`);
      setDetail(data);
      setVideoUrl(data.videoUrl ?? "");
    },
    [params.storeId],
  );
  const reloadQueue = useCallback(async () => {
    const { data } = await axios.get(`/api/${params.storeId}/capsule-orders`);
    setOrders(data.orders);
  }, [params.storeId]);

  useEffect(() => {
    if (!selected) return;
    load(selected).catch((error) => toast({ title: "No se pudo abrir el pedido", description: getErrorMessage(error), variant: "destructive" }));
  }, [selected, load, toast]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast({ title: "No se pudo", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const draw = (value: string) =>
    act(async () => {
      if (!selected || !value.trim()) return;
      const { data } = await axios.post(`/api/${params.storeId}/capsule-orders/${selected}/draw`, { code: value.trim() });
      toast({ title: data.kind === "GIFT" ? "Regalo sacado" : `Papel ${data.drawnSlips} sacado` });
      setCode("");
      // Cada escaneo recarga solo el pedido abierto; la fila de la cola se ajusta aquí, sin pedir la cola entera.
      await load(selected);
      setOrders((current) =>
        current.map((order) => (order.orderId === selected ? { ...order, slipsDrawn: data.drawnSlips, giftsDrawn: data.drawnGifts } : order)),
      );
      codeInput.current?.focus();
    });

  const finish = () =>
    act(async () => {
      if (!selected) return;
      const { data } = await axios.post(`/api/${params.storeId}/capsule-orders/${selected}/finish`);
      const guide = data.guideQueued ? " La guía de EnvioClick se está creando con esa caja; revisa el pedido en un momento." : "";
      toast({ title: "Sorteo cerrado", description: `Costo real ${currencyFormatter(data.realCost)} · empácalo en ${data.box.name ?? `la caja ${data.box.type}`}.${guide}` });
      await Promise.all([load(selected), reloadQueue()]);
    });

  const advanceVideo = (videoStatus: string) =>
    act(async () => {
      if (!selected) return;
      await axios.patch(`/api/${params.storeId}/capsule-orders/${selected}/video`, { videoStatus, videoUrl });
      toast({ title: `Video: ${VIDEO_STEPS.find((step) => step.status === videoStatus)?.label}` });
      await Promise.all([load(selected), reloadQueue()]);
    });

  const [day, setDay] = useState<DayStatus | null>(initialDay);
  const [capInput, setCapInput] = useState(String(initialDay?.cap ?? ""));
  const saveTodayCap = () =>
    act(async () => {
      const { data } = await axios.put(`/api/${params.storeId}/capsule-day-cap`, { cap: Number(capInput) });
      setDay(data);
      toast({ title: `Tope de hoy: ${data.cap} pedidos`, description: `Quedan ${data.left} cupos.` });
    });

  const list = tab === "sacar" ? toDraw : drawnOrders;
  const slipsDone = detail ? detail.slipsDrawn >= detail.packSize : false;
  const giftsDone = detail ? detail.giftMaxItems === 0 || detail.giftsDrawn > 0 : false;
  const nextVideo = detail ? VIDEO_STEPS[VIDEO_STEPS.findIndex((step) => step.status === detail.videoStatus) + 1] : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <SectionCard id="cola" title="Pedidos" description="Pedidos de cápsulas pagados.">
        {day && (
          <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid="cupos-de-hoy">
            <p className="text-sm font-medium">
              Cupos de hoy: {day.used} de {day.cap} · {day.left === 1 ? "queda 1" : `quedan ${day.left}`}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="tope-hoy" className="text-xs text-muted-foreground">
                  Tope de hoy
                </Label>
                <Input id="tope-hoy" type="number" inputMode="numeric" min={0} max={100} className="h-11 w-24" value={capInput} onChange={(event) => setCapInput(event.target.value)} />
              </div>
              <Button variant="outline" className="min-h-[44px]" disabled={busy || capInput === "" || Number(capInput) === day.cap} onClick={saveTodayCap}>
                Cambiar tope de hoy
              </Button>
            </div>
          </div>
        )}
        <div role="tablist" aria-label="Cola de cápsulas" className="grid grid-cols-2 gap-2">
          {(["sacar", "videos"] as const).map((key) => (
            <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? "default" : "outline"} className="min-h-[44px]" onClick={() => setTab(key)}>
              {key === "sacar" ? `Por sacar (${toDraw.length})` : `Videos (${drawnOrders.length})`}
            </Button>
          ))}
        </div>
        {tab === "sacar" && pendingTransfers.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3" data-testid="transferencias-por-verificar">
            <p className="text-sm font-medium">Transferencias por verificar ({pendingTransfers.length})</p>
            <p className="text-xs text-muted-foreground">No se sacan hasta marcarlas pagadas en el pedido. Su cupo queda apartado mientras tanto.</p>
            <ul className="flex flex-col gap-2">
              {pendingTransfers.map((row) => (
                <li key={row.orderId}>
                  <a
                    href={`/${params.storeId}/pedidos/${row.orderId}`}
                    className="flex min-h-[44px] flex-col gap-1 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium">
                      {row.firstName} · pack de {row.packSize}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.orderNumber} · {row.hasProof ? "comprobante recibido" : "sin comprobante"} ·{" "}
                      {row.holdUntil ? `cupo apartado hasta ${new Date(row.holdUntil).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "el apartado venció: al pagarse toma un cupo de más"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tab === "sacar" ? "No hay pedidos por sacar." : "Todavía no hay pedidos sacados."}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((order) => (
              <li key={order.orderId}>
                <button
                  type="button"
                  onClick={() => setSelected(order.orderId)}
                  aria-current={selected === order.orderId ? "true" : undefined}
                  className={`flex min-h-[44px] w-full flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${selected === order.orderId ? "border-primary" : ""}`}
                >
                  <span className="font-medium">
                    {order.firstName} · pack de {order.packSize}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {order.orderNumber} · Edición #{order.edition.number} · {order.slipsDrawn}/{order.packSize} papeles
                  </span>
                  {tab === "videos" && <TintBadge tone="lavender" label={VIDEO_STEPS.find((step) => step.status === order.videoStatus)?.label ?? order.videoStatus} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard id="pedido" title={detail ? `${detail.firstName} · pack de ${detail.packSize}` : "Elige un pedido"} description={detail ? `${detail.orderNumber} · Edición #${detail.edition.number} · ${detail.edition.name}` : undefined}>
        {!detail ? (
          <p className="text-sm text-muted-foreground">Elige un pedido de la lista.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Papeles</dt>
                <dd className="text-lg font-semibold">
                  {detail.slipsDrawn} de {detail.packSize}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Regalo</dt>
                <dd className="text-lg font-semibold">{detail.giftMaxItems === 0 ? "Sin regalo" : `${detail.giftsDrawn} de ${detail.giftMaxItems}`}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Costo {detail.costStatus === "REAL" ? "real" : "provisional"}</dt>
                <dd className="text-lg font-semibold">{currencyFormatter((detail.costStatus === "REAL" ? detail.realCost : detail.provisionalCost) ?? 0)}</dd>
              </div>
            </dl>

            {!detail.drawCompletedAt && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  draw(code);
                }}
              >
                <Label htmlFor="codigo-papel">Código del papel</Label>
                <div className="flex flex-wrap gap-2">
                  <Input id="codigo-papel" ref={codeInput} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" className="h-11 min-w-0 flex-1" placeholder="CAP-E1-…" />
                  {/* Con los papeles completos sigue abierto para escanear el QR del regalo. */}
                  <Button type="submit" className="min-h-[44px]" disabled={busy || !code.trim() || (slipsDone && giftsDone)}>
                    Sacar
                  </Button>
                  <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setCamera((value) => !value)} aria-pressed={camera}>
                    {camera ? "Apagar cámara" : "Usar cámara"}
                  </Button>
                </div>
                {camera && <ContinuousBarcodeScanner onDetected={(scanned) => draw(scanned)} active={!busy} />}
              </form>
            )}

            {detail.giftMaxItems > 0 && !detail.drawCompletedAt && detail.giftsDrawn < detail.giftMaxItems && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Regalos que le caben (hasta {currencyFormatter(detail.giftMaxCost)})</h3>
                {detail.giftOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No quedan regalos en la bolsa dentro del tope.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {detail.giftOptions.map((gift) => (
                      <li key={gift.code} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                        <span className="text-sm">
                          {gift.productName} · {currencyFormatter(gift.unitCost)}
                        </span>
                        <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => draw(gift.code)}>
                          Sacar este regalo
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Lo que salió</h3>
              {detail.drawn.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía nada.</p>
              ) : (
                <ol className="flex flex-col divide-y rounded-md border">
                  {detail.drawn.map((slip) => (
                    <li key={slip.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                      <span>
                        {slip.productName} {slip.kind === "GIFT" && <TintBadge tone="pink" label="Regalo" />}
                      </span>
                      <span className="text-muted-foreground">{currencyFormatter(slip.unitCost)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {!detail.drawCompletedAt ? (
              <Button className="min-h-[44px] self-start" disabled={busy || !slipsDone || !giftsDone} onClick={finish}>
                Cerrar sorteo
              </Button>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm">
                  Sorteo cerrado · costo real {currencyFormatter(detail.realCost ?? 0)} (provisional {currencyFormatter(detail.provisionalCost ?? 0)}) · caja sugerida <strong>{boxName(detail.suggestedBox)}</strong>
                </p>
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <h3 className="text-sm font-medium">Video</h3>
                  <p className="text-sm text-muted-foreground">{CONSENT_LABEL[detail.videoConsent]}</p>
                  <ol className="flex flex-wrap gap-2" aria-label="Estado del video">
                    {VIDEO_STEPS.map((step) => (
                      <li key={step.status}>
                        <TintBadge tone={step.status === detail.videoStatus ? "mint" : "slate"} label={step.label} />
                      </li>
                    ))}
                  </ol>
                  <Label htmlFor="enlace-video">Enlace del video</Label>
                  <Input id="enlace-video" className="h-11" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://" />
                  {nextVideo && (
                    <Button className="min-h-[44px] self-start" disabled={busy || (nextVideo.status === "PUBLICADO" && detail.videoConsent !== "PUBLIC_FIRST_NAME")} onClick={() => advanceVideo(nextVideo.status)}>
                      Marcar «{nextVideo.label}»
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
