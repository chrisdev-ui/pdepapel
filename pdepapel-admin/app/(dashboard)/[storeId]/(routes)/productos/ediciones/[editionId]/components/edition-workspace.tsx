"use client";

import axios from "axios";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_CONTENT_OPTIONS, openLabelPrintJob } from "@/components/labels/qr-label-print-sheet";
import { ActionConfirmationDialog } from "@/components/modals/action-confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { DEFAULT_LABEL_SHEET, DEFAULT_SHEET_OPTIONS } from "@/lib/label-printing";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";
import { currencyFormatter } from "@/lib/utils";

import { EDITION_STATUS } from "../../components/editions-client";
import type { EditionWorkspaceData } from "../server/get-edition-workspace";

interface Candidate {
  productId: string;
  name: string;
  sku: string;
  categoryName: string | null;
  unitCost: number;
  available: number;
  printed: number;
  idle: boolean;
  reason: string;
}

interface PackCheck {
  packSize: number;
  total: number;
  available: boolean;
  expectedPct: number | null;
  p95Pct: number | null;
  worstPct: number | null;
  passes: boolean | null;
}

interface MarginCheck {
  poolSize: number;
  minMarginPct: number | null;
  floorSource: "edition" | "store" | null;
  packs: PackCheck[];
  ok: boolean;
}

type PackForm = Record<number, { giftMaxCost: string; giftMaxItems: string; giftLabel: string; boxReserveCost: string }>;

const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("es-CO")} %`);

/**
 * El taller de una edición: elegir la bolsa (papeles por categoría y banda),
 * revisar el margen de cada pack, guardar regalos y caja por pack, imprimir
 * papeles y regalos, y ver o anular lo impreso.
 */
export function EditionWorkspace({ data }: { data: EditionWorkspaceData }) {
  const params = useParams<{ storeId: string }>();
  const { toast } = useToast();
  const { categories } = data;
  // La edición, la bolsa y lo impreso se vuelven a pedir a la API: refrescar la página la remontaría (productos/loading.tsx) y se perdería la bolsa en curso.
  const [detail, setDetail] = useState({ edition: data.edition, pool: data.pool, printedSlips: data.printedSlips });
  const { edition, pool, printedSlips } = detail;
  const editable = edition.status === "DRAFT" || edition.status === "PREVIEW";

  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [includeSelling, setIncludeSelling] = useState(false);
  const searchParams = useSearchParams();
  const [themes, setThemes] = useState<{ key: string; label: string; count: number }[]>([]);
  const [bagFloor, setBagFloor] = useState<{ value: number; source: string } | null>(null);
  const [themeKey, setThemeKey] = useState(searchParams.get("tema") ?? "");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [check, setCheck] = useState<MarginCheck | null>(null);
  const [gifts, setGifts] = useState<Candidate[] | null>(null);
  const [giftQuantities, setGiftQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Guardar los packs no refresca la página: `productos/loading.tsx` la volvería a montar y se perdería la bolsa elegida.
  const [packsSaved, setPacksSaved] = useState(edition.packOptions.length > 0);
  const [editionFloor, setEditionFloor] = useState<number | null>(edition.minMarginPct);
  const [floorInput, setFloorInput] = useState(edition.minMarginPct === null ? "" : String(edition.minMarginPct));
  const floorLabel =
    editionFloor !== null ? `${editionFloor} % (margen mínimo de esta edición)` : data.storeMinMarginPct !== null ? `${data.storeMinMarginPct} % (margen mínimo de la tienda)` : "sin piso: pon el de la edición o el de la tienda en Configuración";
  const [packs, setPacks] = useState<PackForm>(() =>
    Object.fromEntries(
      CAPSULE_PACK_PRICES.map((price) => {
        const saved = edition.packOptions.find((option) => option.packSize === price.packSize);
        return [price.packSize, { giftMaxCost: String(saved?.giftMaxCost ?? 0), giftMaxItems: String(saved?.giftMaxItems ?? 0), giftLabel: saved?.giftLabel ?? "", boxReserveCost: String(saved?.boxReserveCost ?? 0) }];
      }),
    ),
  );

  const proposed = useMemo(() => Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity })), [quantities]);
  const proposedUnits = proposed.reduce((total, line) => total + line.quantity, 0);
  const proposedGifts = Object.entries(giftQuantities).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
  const packOptions = CAPSULE_PACK_PRICES.map((price) => ({
    packSize: price.packSize,
    giftMaxCost: Number(packs[price.packSize].giftMaxCost) || 0,
    giftMaxItems: Number(packs[price.packSize].giftMaxItems) || 0,
    giftLabel: packs[price.packSize].giftLabel,
    boxReserveCost: Number(packs[price.packSize].boxReserveCost) || 0,
  }));

  const api = `/api/${params.storeId}/capsule-editions/${edition.id}`;
  const reloadDetail = async () => {
    const { data: fresh } = await axios.get(api);
    setDetail({ edition: fresh.edition, pool: fresh.pool, printedSlips: fresh.printedSlips });
  };
  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (error) {
      const details = axios.isAxiosError(error) ? (error.response?.data?.details as { check?: MarginCheck } | undefined) : undefined;
      if (details?.check) setCheck(details.check);
      toast({ title: "No se pudo", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const loadCandidates = () =>
    run("candidatos", async () => {
      const { data: body } = await axios.get(`${api}/candidates`, { params: { tipo: "papeles", categorias: categoryIds.join(","), ...(includeSelling ? { todos: "1" } : {}) } });
      setCandidates(body.candidates);
      setQuantities({});
      setCheck(null);
    });

  const suggestBag = (key: string) =>
    run("sugerir", async () => {
      const { data: body } = await axios.get(`${api}/suggested-bag`, { params: key ? { tema: key } : {} });
      setThemes(body.themes);
      setBagFloor(body.floor);
      setCandidates(body.bag.map((line: Candidate & { quantity: number }) => ({ ...line, sku: "", idle: true })));
      setQuantities(Object.fromEntries(body.bag.map((line: { productId: string; quantity: number }) => [line.productId, line.quantity])));
      setCheck(null);
      if (body.bag.length === 0) toast({ title: "Sin bolsa sugerida", description: "No hay productos quietos de ese tema dentro de la banda de la edición." });
    });

  // Al llegar desde «Usar esta sugerencia» (`?tema=`) se arma la misma bolsa; sin tema, solo se cargan los temas.
  const loadedThemes = useRef(false);
  useEffect(() => {
    if (!editable || loadedThemes.current) return;
    loadedThemes.current = true;
    if (themeKey) void suggestBag(themeKey);
    else void axios.get(`${api}/suggested-bag`).then(({ data: body }) => setThemes(body.themes)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGifts = () =>
    run("regalos", async () => {
      const { data: body } = await axios.get(`${api}/candidates`, { params: { tipo: "regalos" } });
      setGifts(body.candidates);
      setGiftQuantities({});
    });

  const reviewMargin = () =>
    run("margen", async () => {
      const { data: body } = await axios.post(`${api}/margin-check`, { pool: proposed, packOptions });
      setCheck(body);
    });

  const savePacks = () =>
    run("packs", async () => {
      const { data: body } = await axios.put(`${api}/pack-options`, { options: packOptions, pool: proposed });
      setCheck(body.check);
      setPacksSaved(true);
      toast({ title: "Packs guardados", description: "La escalera de precio del producto de la edición quedó al día." });
    });

  const printLabels = (slips: { id: string; code: string; productName: string; sku: string }[], ) => {
    const opened = openLabelPrintJob({
      storeId: params.storeId,
      source: "capsule",
      labels: slips.map((slip) => ({ id: slip.id, code: slip.code, title: slip.productName, variant: `Edición #${edition.number} · ${edition.name}`, sku: slip.sku })),
      templateId: DEFAULT_LABEL_SHEET,
      startAt: 1,
      sheet: DEFAULT_SHEET_OPTIONS,
      content: { ...DEFAULT_CONTENT_OPTIONS, showSku: false, showPrice: false },
      createdAt: new Date().toISOString(),
    });
    if (!opened) toast({ title: "No se pudo preparar la hoja", description: "El navegador no dejó guardarla. Inténtalo de nuevo.", variant: "destructive" });
  };

  const print = (kind: "SLIP" | "GIFT") =>
    run(kind === "SLIP" ? "imprimir" : "imprimir-regalos", async () => {
      const items = kind === "SLIP" ? proposed : proposedGifts;
      const { data: body } = await axios.post(`${api}/slips`, { kind, items }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
      toast({ title: `${body.printed} ${kind === "SLIP" ? "papeles" : "regalos"} impresos`, description: "Quedaron apartados. Se abre la hoja de etiquetas." });
      printLabels(body.slips);
      if (kind === "SLIP") setQuantities({});
      else setGiftQuantities({});
      await reloadDetail();
    });

  const voidProduct = (productId: string, kind: string) =>
    run(`anular-${productId}`, async () => {
      const slipIds = printedSlips.filter((slip) => slip.productId === productId && slip.kind === kind).map((slip) => slip.id);
      const { data: body } = await axios.post(`${api}/slips/void`, { slipIds });
      toast({ title: `${body.voided} anulados`, description: "Su apartado se liberó." });
      await reloadDetail();
    });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const makePreviewLink = () =>
    run("vista", async () => {
      const { data: body } = await axios.post(`${api}/preview-link`);
      setPreviewUrl(body.url);
      try {
        await navigator.clipboard.writeText(body.url);
        toast({ title: "Enlace de vista previa copiado", description: "Sirve 14 días y solo para esta edición." });
      } catch {
        toast({ title: "Enlace de vista previa listo", description: "Cópialo de la caja de abajo." });
      }
    });

  const saveFloor = () =>
    run("piso", async () => {
      const value = floorInput.trim() === "" ? null : Number(floorInput);
      const { data: body } = await axios.patch(api, { minMarginPct: value });
      setEditionFloor(body.edition.minMarginPct);
      setCheck(null);
      toast({ title: body.edition.minMarginPct === null ? "Esta edición usa el margen mínimo de la tienda" : `Margen mínimo de la edición: ${body.edition.minMarginPct} %` });
    });

  const setStatus = (status: string) =>
    run(`estado-${status}`, async () => {
      await axios.patch(api, { status });
      toast({ title: status === "CLOSED" ? "Edición cerrada" : status === "LIVE" ? "La edición está a la venta en la tienda" : `Edición en ${EDITION_STATUS[status].label.toLowerCase()}` });
      await reloadDetail();
    });

  const quantityInput = (row: Candidate, values: Record<string, number>, setValues: (next: Record<string, number>) => void, label: string) => (
    <Input
      aria-label={`${label} de ${row.name}`}
      inputMode="numeric"
      className="h-11 w-24"
      value={values[row.productId] ?? ""}
      onChange={(event) => {
        const next = Math.max(0, Math.min(row.available, Math.floor(Number(event.target.value) || 0)));
        setValues({ ...values, [row.productId]: next });
      }}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={`/${params.storeId}/productos/ediciones`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Ediciones de cápsulas
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            #{edition.number} · {edition.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {edition.product.name} · banda {currencyFormatter(edition.costBandMin)}–{currencyFormatter(edition.costBandMax)} · {edition.unsold} cápsulas sin vender · tope {edition.dailyOrderCap} pedidos por día
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TintBadge tone={EDITION_STATUS[edition.status].tone} label={EDITION_STATUS[edition.status].label} />
          {edition.status === "DRAFT" && (
            <Button variant="outline" className="min-h-[44px]" disabled={busy !== null} onClick={() => setStatus("PREVIEW")}>
              Pasar a vista previa
            </Button>
          )}
          {edition.status === "PREVIEW" && (
            <Button variant="outline" className="min-h-[44px]" disabled={busy !== null} onClick={() => setStatus("DRAFT")}>
              Volver a borrador
            </Button>
          )}
          {edition.status === "PREVIEW" && (
            <Button className="min-h-[44px]" disabled={busy !== null || !packsSaved} onClick={() => setConfirmOpen(true)}>
              Poner a la venta
            </Button>
          )}
          {edition.status === "LIVE" && (
            <Button variant="outline" className="min-h-[44px]" disabled={busy !== null} onClick={() => setStatus("PREVIEW")}>
              Pausar la venta
            </Button>
          )}
          {edition.status !== "CLOSED" && (
            <Button variant="outline" className="min-h-[44px]" disabled={busy !== null} onClick={makePreviewLink}>
              Enlace de vista previa
            </Button>
          )}
          {edition.status !== "CLOSED" && (
            <Button variant="destructive" className="min-h-[44px]" disabled={busy !== null} onClick={() => setConfirmClose(true)}>
              Cerrar edición
            </Button>
          )}
        </div>
      </div>

      {previewUrl && (
        <div className="flex flex-col gap-1 rounded-lg border bg-white p-3">
          <Label htmlFor="enlace-vista-previa">Vista previa en la tienda (14 días, solo esta edición; se compra solo cuando está a la venta)</Label>
          <Input id="enlace-vista-previa" readOnly value={previewUrl} className="h-11" onFocus={(event) => event.currentTarget.select()} />
        </div>
      )}

      {editable && (
        <SectionCard id="bolsa" step={1} title="Bolsa de papeles" description="Elige las categorías del tema: salen los productos quietos (sin ventas en 90 días) con costo dentro de la banda y algo disponible. Quita lo que no quepa en una cápsula.">
          <div className="flex flex-col gap-2 rounded-md border bg-white p-3">
            <Label htmlFor="sugerir-tema">Sugerir bolsa por tema</Label>
            <p className="text-xs text-muted-foreground">Llena las cantidades con productos quietos del tema dentro de la banda; cada fila dice por qué. Quita los más caros hasta que cada pack que cabe pase el piso. Cámbialas como quieras: nada se imprime hasta que lo pidas.</p>
            {bagFloor && (
              <p className="text-xs font-medium" data-testid="piso-bolsa">
                Piso usado: {bagFloor.value.toLocaleString("es-CO")} % ({bagFloor.source === "edition" ? "de esta edición" : bagFloor.source === "capsules" ? "margen mínimo de cápsulas" : "margen mínimo de la tienda"})
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id="sugerir-tema"
                className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
                value={themeKey}
                onChange={(event) => setThemeKey(event.target.value)}
              >
                <option value="">Todos los quietos de la banda</option>
                {themeKey && !themes.some((theme) => theme.key === themeKey) && <option value={themeKey}>Tema de la sugerencia</option>}
                {themes.map((theme) => (
                  <option key={theme.key} value={theme.key}>
                    {theme.label} ({theme.count})
                  </option>
                ))}
              </select>
              <Button className="min-h-[44px]" disabled={busy !== null} onClick={() => suggestBag(themeKey)}>
                {busy === "sugerir" ? "Armando…" : "Sugerir bolsa"}
              </Button>
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">O busca por categorías</legend>
            <div className="grid max-h-60 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => {
                const id = `categoria-${category.id}`;
                const checked = categoryIds.includes(category.id);
                return (
                  <label key={category.id} htmlFor={id} className="flex min-h-[44px] items-center gap-2 rounded px-2 hover:bg-muted/50">
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) => setCategoryIds((current) => (value ? [...current, category.id] : current.filter((item) => item !== category.id)))}
                    />
                    <span className="text-sm">{category.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label htmlFor="incluir-vendidos" className="flex min-h-[44px] items-center gap-2 text-sm">
            <Checkbox id="incluir-vendidos" checked={includeSelling} onCheckedChange={(value) => setIncludeSelling(value === true)} />
            Incluir productos que sí se venden
          </label>
          <div>
            <Button className="min-h-[44px]" disabled={categoryIds.length === 0 || busy !== null} onClick={loadCandidates}>
              {busy === "candidatos" ? "Buscando…" : "Buscar productos"}
            </Button>
          </div>
          {candidates && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {candidates.length} productos · {proposedUnits} papeles elegidos
                </span>
                <Button variant="outline" className="min-h-[44px]" onClick={() => setQuantities(Object.fromEntries(candidates.map((row) => [row.productId, row.available])))}>
                  Todo lo disponible
                </Button>
              </div>
              <ul className="flex flex-col divide-y rounded-md border">
                {candidates.map((row) => (
                  <li key={row.productId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.categoryName ? `${row.categoryName} · ` : ""}costo {currencyFormatter(row.unitCost)} · {row.available} disponibles{row.printed ? ` · ${row.printed} ya impresos` : ""}
                      </p>
                      <p className={row.idle ? "text-xs text-foreground" : "text-xs text-amber-700"}>{row.reason}</p>
                    </div>
                    {quantityInput(row, quantities, setQuantities, "Papeles")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {editable && (
        <SectionCard
          id="packs"
          step={2}
          title="Packs: regalo y caja"
          description="Cada pack se guarda —y los papeles se imprimen— solo si su P95 llega al piso. El margen se mide sobre lo impreso más lo elegido."
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="piso-edicion">Margen mínimo de esta edición (%)</Label>
              <Input id="piso-edicion" inputMode="decimal" className="h-11 w-32" value={floorInput} onChange={(event) => setFloorInput(event.target.value)} placeholder={data.storeMinMarginPct === null ? "" : `tienda: ${data.storeMinMarginPct}`} />
            </div>
            <Button variant="outline" className="min-h-[44px]" disabled={busy !== null} onClick={saveFloor}>
              {busy === "piso" ? "Guardando…" : "Guardar piso"}
            </Button>
            <p className="text-sm text-muted-foreground" data-testid="piso-vigente">
              Piso vigente: {floorLabel}
            </p>
          </div>
          <div className="flex flex-col divide-y rounded-md border">
            {CAPSULE_PACK_PRICES.map((price) => {
              const row = packs[price.packSize];
              const setField = (field: keyof PackForm[number]) => (event: React.ChangeEvent<HTMLInputElement>) =>
                setPacks((current) => ({ ...current, [price.packSize]: { ...current[price.packSize], [field]: event.target.value } }));
              const result = check?.packs.find((pack) => pack.packSize === price.packSize);
              return (
                <div key={price.packSize} className="grid gap-3 p-3 md:grid-cols-[8rem_repeat(4,minmax(0,1fr))_9rem] md:items-end">
                  <div>
                    <p className="font-medium">Pack de {price.packSize}</p>
                    <p className="text-xs text-muted-foreground">{currencyFormatter(price.total)}</p>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`regalo-tope-${price.packSize}`}>Tope del regalo</Label>
                    <Input id={`regalo-tope-${price.packSize}`} inputMode="numeric" className="h-11" value={row.giftMaxCost} onChange={setField("giftMaxCost")} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`regalo-cantidad-${price.packSize}`}>Regalos</Label>
                    <Input id={`regalo-cantidad-${price.packSize}`} inputMode="numeric" className="h-11" value={row.giftMaxItems} onChange={setField("giftMaxItems")} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`regalo-texto-${price.packSize}`}>Texto del regalo</Label>
                    <Input id={`regalo-texto-${price.packSize}`} className="h-11" maxLength={120} value={row.giftLabel} onChange={setField("giftLabel")} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`caja-${price.packSize}`}>Caja y empaque</Label>
                    <Input id={`caja-${price.packSize}`} inputMode="numeric" className="h-11" value={row.boxReserveCost} onChange={setField("boxReserveCost")} />
                  </div>
                  <div className="text-sm" data-testid={`margen-pack-${price.packSize}`}>
                    {!result ? (
                      <span className="text-muted-foreground">Sin revisar</span>
                    ) : !result.available ? (
                      <span className="text-muted-foreground">No disponible con esta bolsa</span>
                    ) : (
                      <span className={result.passes === false ? "font-medium text-destructive" : ""}>
                        P95 {percent(result.p95Pct)} · esperado {percent(result.expectedPct)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-[44px]" disabled={busy !== null} onClick={reviewMargin}>
              {busy === "margen" ? "Calculando…" : "Revisar margen"}
            </Button>
            <Button className="min-h-[44px]" disabled={busy !== null} onClick={savePacks}>
              {busy === "packs" ? "Guardando…" : "Guardar packs"}
            </Button>
            <Button className="min-h-[44px]" disabled={busy !== null || proposedUnits === 0 || !packsSaved} onClick={() => print("SLIP")}>
              {busy === "imprimir" ? "Imprimiendo…" : `Imprimir ${proposedUnits} papeles`}
            </Button>
          </div>
          {check && (
            <p className={`text-sm ${check.ok ? "text-muted-foreground" : "font-medium text-destructive"}`} role="status">
              Bolsa de {check.poolSize} papeles · piso {check.minMarginPct === null ? "sin configurar" : `${check.minMarginPct} % (${check.floorSource === "edition" ? "de la edición" : "de la tienda"})`} ·{" "}
              {check.ok ? "todos los packs que caben llegan al piso" : "algún pack no llega al piso"}
            </p>
          )}
        </SectionCard>
      )}

      {editable && (
        <SectionCard id="regalos" step={3} title="Regalos" description="Productos quietos (sin ventas en la ventana de lentos) con costo hasta el tope de regalo más alto de los packs guardados. Quedan apartados como los papeles.">
          <div>
            <Button variant="outline" className="min-h-[44px]" disabled={busy !== null || !packsSaved} onClick={loadGifts}>
              {busy === "regalos" ? "Buscando…" : "Buscar regalos"}
            </Button>
          </div>
          {gifts && (
            <>
              <ul className="flex flex-col divide-y rounded-md border">
                {gifts.length === 0 && <li className="p-3 text-sm text-muted-foreground">No hay productos quietos dentro del tope.</li>}
                {gifts.map((row) => (
                  <li key={row.productId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        costo {currencyFormatter(row.unitCost)} · {row.available} disponibles{row.printed ? ` · ${row.printed} ya en la bolsa` : ""}
                      </p>
                    </div>
                    {quantityInput(row, giftQuantities, setGiftQuantities, "Regalos")}
                  </li>
                ))}
              </ul>
              <div>
                <Button className="min-h-[44px]" disabled={busy !== null || proposedGifts.length === 0} onClick={() => print("GIFT")}>
                  {busy === "imprimir-regalos" ? "Imprimiendo…" : "Imprimir regalos"}
                </Button>
              </div>
            </>
          )}
        </SectionCard>
      )}

      <SectionCard
        id="impresos"
        title="Lo impreso"
        description="Papeles y regalos por producto. Anular libera el apartado; un papel ya vendido no se anula."
        action={
          printedSlips.length > 0 ? (
            <Button variant="outline" className="min-h-[44px]" onClick={() => printLabels(printedSlips)}>
              Reimprimir {printedSlips.length} etiquetas
            </Button>
          ) : undefined
        }
      >
        {pool.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se imprimió nada.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {pool.map((row) => (
              <li key={`${row.kind}-${row.productId}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {row.name} <span className="text-xs text-muted-foreground">({row.kind === "GIFT" ? "regalo" : "papel"})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    costo {currencyFormatter(row.unitCost)} · {row.printed} impresos · {row.drawn} sacados · {row.voided} anulados
                  </p>
                </div>
                {row.printed > 0 && edition.status !== "CLOSED" && (
                  <Button variant="outline" className="min-h-[44px]" disabled={busy !== null} onClick={() => voidProduct(row.productId, row.kind)}>
                    Anular {row.printed}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ActionConfirmationDialog
        isOpen={confirmClose}
        onOpenChange={setConfirmClose}
        onConfirm={() => {
          setConfirmClose(false);
          setStatus("CLOSED");
        }}
        title="¿Cerrar la edición?"
        description={`${edition.status === "LIVE" ? "La edición sale de la tienda y deja de venderse. " : ""}Se anulan los papeles y regalos que siguen impresos y se libera su apartado. No se puede si hay pedidos de esta edición sin terminar de sacar. Cerrar no se deshace.`}
        confirmLabel="Cerrar edición"
        destructive
      />
      <ActionConfirmationDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          setConfirmOpen(false);
          setStatus("LIVE");
        }}
        title="¿Poner la edición a la venta?"
        description="La edición quedará a la venta en la tienda: aparece en el menú y en el inicio, y cualquiera puede comprar packs desde ya, con los cupos del día. Para detenerla, usa «Pausar la venta»."
        confirmLabel="Poner a la venta"
      />
    </div>
  );
}
