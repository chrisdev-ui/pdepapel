"use client";

import axios from "axios";
import { Reorder, useDragControls } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, CornerDownRight, ExternalLink, GripVertical, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { TintBadge } from "@/components/ui/tint-badge";
import { ToastAction } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  brandFlagToast,
  brandMoveBounds,
  brandsApi,
  groupBrands,
  moveBrand,
  normalizeBrandOrder,
  plural,
  sameOrder,
  type BrandFlag,
} from "@/lib/brand-admin";
import { cn } from "@/lib/utils";

import type { BrandRow } from "../server/get-brands";
import { BrandLogoTile } from "./brand-logo-tile";
import { BrandRowMenu } from "./brand-row-menu";

interface BrandsClientProps {
  data: BrandRow[];
  unbranded: number;
  unbrandedMatching: number;
  storeUrl: string | null;
}

type Flags = Partial<Record<BrandFlag, boolean>>;

const GRID = "grid grid-cols-[120px_88px_minmax(0,1fr)_88px_120px_170px_48px] items-center gap-2";

function storeHref(storeUrl: string | null, slug: string) {
  return storeUrl ? `${storeUrl.replace(/\/$/, "")}/marcas/${slug}` : null;
}

function BrandIdentity({
  brand,
  storeUrl,
  storeId,
  nested,
}: {
  brand: BrandRow;
  storeUrl: string | null;
  storeId: string;
  nested: boolean;
}) {
  const href = storeHref(storeUrl, brand.slug);
  const pending = brand.logoPermission === "PENDING" || brand.logoPermission === "DENIED";
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-2">
        {nested && <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <Link href={`/${storeId}/marcas/${brand.id}`} className="font-semibold text-primary underline-offset-4 hover:underline">
          {brand.name}
        </Link>
        {brand.parentName && <TintBadge label={`línea de ${brand.parentName}`} tone="lavender" />}
        {brand.logoPermission === "PENDING" && <TintBadge label="Permiso pendiente" tone="cream" />}
        {brand.logoPermission === "DENIED" && <TintBadge label="Permiso negado" tone="pink" />}
        {!brand.logoUrl && !pending && <TintBadge label="Falta el logo" tone="cream" />}
        {!brand.isVisible && !brand.isArchived && <TintBadge label="Oculta" tone="slate" />}
      </div>
      {brand.aliases.length > 0 && (
        <span className="truncate text-xs text-muted-foreground">Alias: {brand.aliases.join(", ")}</span>
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          /marcas/{brand.slug}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">(abre la tienda en otra pestaña)</span>
        </a>
      ) : (
        <span className="text-xs text-muted-foreground">/marcas/{brand.slug}</span>
      )}
    </div>
  );
}

function ProductCount({ brand }: { brand: BrandRow }) {
  const detail = `${brand.activeProducts} activos · ${brand.totalProducts} en total`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="min-h-11 min-w-11 text-right font-semibold tabular-nums text-primary underline decoration-dotted underline-offset-4"
          aria-label={`${brand.name}: ${detail}`}
        >
          {brand.activeProducts}
        </button>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

function FlagSwitch({
  brand,
  flag,
  checked,
  disabled,
  onChange,
}: {
  brand: BrandRow;
  flag: BrandFlag;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const label = flag === "isVisible" ? `Visible en la tienda: ${brand.name}` : `En «Compra por marca»: ${brand.name}`;
  const text = flag === "isVisible" ? (checked ? "Sí" : "No") : checked ? "En el carrusel" : "No sale";
  return (
    <div className="flex min-h-11 items-center gap-2">
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
      <span aria-hidden="true" className="text-sm text-primary">
        {text}
      </span>
    </div>
  );
}

function MoveButtons({
  brand,
  bounds,
  disabled,
  onMove,
}: {
  brand: BrandRow;
  bounds: { up: boolean; down: boolean };
  disabled: boolean;
  onMove: (brandId: string, delta: -1 | 1) => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        aria-label={`Subir ${brand.name}`}
        disabled={disabled || !bounds.up}
        onClick={() => onMove(brand.id, -1)}
      >
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        aria-label={`Bajar ${brand.name}`}
        disabled={disabled || !bounds.down}
        onClick={() => onMove(brand.id, 1)}
      >
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </Button>
    </>
  );
}

interface RowProps {
  brand: BrandRow;
  /** Línea mostrada debajo de su madre. */
  nested: boolean;
  bounds: { up: boolean; down: boolean };
  flags: Flags;
  canWrite: boolean;
  sortable: boolean;
  busy: boolean;
  storeId: string;
  storeUrl: string | null;
  brands: BrandRow[];
  onMove: (brandId: string, delta: -1 | 1) => void;
  onFlag: (brand: BrandRow, flag: BrandFlag, value: boolean) => void;
  onDragEnd: () => void;
}

function DesktopRow(props: RowProps) {
  const { brand, nested, bounds, flags, canWrite, sortable, busy, storeId, storeUrl, brands, onMove, onFlag, onDragEnd } = props;
  const controls = useDragControls();
  const visible = flags.isVisible ?? brand.isVisible;
  const featured = flags.isFeatured ?? brand.isFeatured;
  return (
    <Reorder.Item
      value={brand.id}
      as="div"
      role="row"
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className={cn(GRID, "border-t bg-white px-3 py-2")}
    >
      <div role="cell" className="flex items-center">
        {sortable ? (
          <>
            <span
              className="flex h-11 w-6 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
              onPointerDown={(event) => controls.start(event)}
              aria-hidden="true"
            >
              <GripVertical className="h-4 w-4" />
            </span>
            <MoveButtons brand={brand} bounds={bounds} disabled={busy} onMove={onMove} />
          </>
        ) : (
          <span className="pl-2 text-sm text-muted-foreground">—</span>
        )}
      </div>
      <div role="cell">
        <BrandLogoTile logoUrl={brand.logoUrl} />
      </div>
      <div role="cell" className={cn("min-w-0", nested && "pl-4")}>
        <BrandIdentity brand={brand} storeUrl={storeUrl} storeId={storeId} nested={nested} />
      </div>
      <div role="cell" className="flex justify-end">
        <ProductCount brand={brand} />
      </div>
      <div role="cell">
        <FlagSwitch
          brand={brand}
          flag="isVisible"
          checked={visible}
          disabled={!canWrite || brand.isArchived}
          onChange={(value) => onFlag(brand, "isVisible", value)}
        />
      </div>
      <div role="cell">
        <FlagSwitch
          brand={brand}
          flag="isFeatured"
          checked={featured}
          disabled={!canWrite || brand.isArchived}
          onChange={(value) => onFlag(brand, "isFeatured", value)}
        />
      </div>
      <div role="cell" className="flex justify-end">
        <BrandRowMenu storeId={storeId} brand={brand} brands={brands} />
      </div>
    </Reorder.Item>
  );
}

function MobileCard(props: RowProps) {
  const { brand, nested, bounds, flags, canWrite, sortable, busy, storeId, storeUrl, brands, onMove, onFlag } = props;
  const visible = flags.isVisible ?? brand.isVisible;
  const featured = flags.isFeatured ?? brand.isFeatured;
  return (
    <li className={cn("flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm", nested && "ml-6")}>
      <div className="flex items-start gap-3">
        <BrandLogoTile logoUrl={brand.logoUrl} />
        <div className="min-w-0 flex-1">
          <BrandIdentity brand={brand} storeUrl={storeUrl} storeId={storeId} nested={nested} />
          <p className="mt-1 text-xs text-muted-foreground">
            {plural(brand.activeProducts, "producto activo", "productos activos")} · {brand.totalProducts} en total
          </p>
        </div>
        <BrandRowMenu storeId={storeId} brand={brand} brands={brands} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Visible</span>
          <FlagSwitch
            brand={brand}
            flag="isVisible"
            checked={visible}
            disabled={!canWrite || brand.isArchived}
            onChange={(value) => onFlag(brand, "isVisible", value)}
          />
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Compra por marca</span>
          <FlagSwitch
            brand={brand}
            flag="isFeatured"
            checked={featured}
            disabled={!canWrite || brand.isArchived}
            onChange={(value) => onFlag(brand, "isFeatured", value)}
          />
        </div>
        {sortable && (
          <div className="flex items-center">
            <MoveButtons brand={brand} bounds={bounds} disabled={busy} onMove={onMove} />
          </div>
        )}
      </div>
    </li>
  );
}

const BrandsClient: React.FC<BrandsClientProps> = ({ data, unbranded, unbrandedMatching, storeUrl }) => {
  const router = useRouter();
  const params = useParams();
  const storeId = String(params.storeId);
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const [view, setView] = useState<"activas" | "archivadas">("activas");
  const [flags, setFlags] = useState<Record<string, Flags>>({});
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => data.filter((brand) => !brand.isArchived), [data]);
  const archived = useMemo(() => data.filter((brand) => brand.isArchived), [data]);
  const serverOrder = useMemo(() => normalizeBrandOrder(active).map((brand) => brand.id), [active]);
  const [order, setOrder] = useState<string[]>(serverOrder);
  const savedOrder = useRef<string[]>(serverOrder);
  const latestOrder = useRef<string[]>(order);
  latestOrder.current = order;

  useEffect(() => {
    setOrder(serverOrder);
    savedOrder.current = serverOrder;
    setFlags({});
  }, [serverOrder]);

  const byId = useMemo(() => new Map(data.map((brand) => [brand.id, brand])), [data]);
  const toRows = (ids: string[]) => ids.map((id) => byId.get(id)).filter((brand): brand is BrandRow => Boolean(brand));
  const ordered = toRows(order);
  const archivedRows = useMemo(() => normalizeBrandOrder(archived), [archived]);
  const rows = view === "activas" ? ordered : archivedRows;
  const nestedIds = new Set(groupBrands(rows).flatMap((group) => group.lines.map((line) => line.id)));
  const sortable = canWrite && view === "activas" && ordered.length > 1;

  const persistOrder = async (next: string[]) => {
    if (sameOrder(next, savedOrder.current)) return;
    const previous = savedOrder.current;
    savedOrder.current = next;
    try {
      setBusy(true);
      await axios.post(`${brandsApi(storeId)}/reorder`, { orderedIds: next });
      router.refresh();
    } catch (error) {
      savedOrder.current = previous;
      setOrder(previous);
      toast({ title: "No se pudo guardar el orden", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onMove = (brandId: string, delta: -1 | 1) => {
    const next = moveBrand(ordered, brandId, delta).map((brand) => brand.id);
    setOrder(next);
    void persistOrder(next);
  };

  // Arrastrar mueve una fila suelta: al soltar, las líneas vuelven debajo de su madre.
  const onDragEnd = () => {
    const next = normalizeBrandOrder(toRows(latestOrder.current)).map((brand) => brand.id);
    setOrder(next);
    void persistOrder(next);
  };

  const sendFlag = async (brandId: string, body: Flags) => {
    await axios.patch(`${brandsApi(storeId)}/${brandId}`, body);
  };

  const onFlag = async (brand: BrandRow, flag: BrandFlag, value: boolean) => {
    setFlags((current) => ({ ...current, [brand.id]: { ...current[brand.id], [flag]: value } }));
    try {
      await sendFlag(brand.id, { [flag]: value });
      const { message, undo } = brandFlagToast(brand.name, flag, value);
      toast({
        description: message,
        // Más que los 5 s por defecto: da tiempo de leer y deshacer.
        duration: 10_000,
        action: (
          <ToastAction
            altText={`Deshacer: ${message}`}
            onClick={() => {
              sendFlag(brand.id, undo)
                .then(() => router.refresh())
                .catch((error) => toast({ description: getErrorMessage(error), variant: "destructive" }));
            }}
          >
            Deshacer
          </ToastAction>
        ),
      });
      router.refresh();
    } catch (error) {
      setFlags((current) => ({ ...current, [brand.id]: { ...current[brand.id], [flag]: !value } }));
      toast({ description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const rowProps = (brand: BrandRow) => ({
    brand,
    nested: nestedIds.has(brand.id),
    bounds: sortable ? brandMoveBounds(ordered, brand.id) : { up: false, down: false },
    flags: flags[brand.id] ?? {},
    canWrite,
    sortable,
    busy,
    storeId,
    storeUrl,
    brands: data,
    onMove,
    onFlag: (target: BrandRow, flag: BrandFlag, value: boolean) => void onFlag(target, flag, value),
    onDragEnd,
  });

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Heading
          title={`Marcas (${active.length})`}
          description="Los fabricantes de lo que vendes: su logo original, su página en la tienda y el filtro «Marca»."
        />
        {canWrite && (
          <Button className="min-h-11" onClick={() => router.push(`/${storeId}/marcas/nueva`)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nueva marca
          </Button>
        )}
      </div>
      <Separator />

      {unbranded > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>{plural(unbranded, "producto activo sin marca.", "productos activos sin marca.")}</strong>{" "}
              {unbrandedMatching > 0
                ? `${unbrandedMatching} ${unbrandedMatching === 1 ? "coincide" : "coinciden"} con una marca por su nombre o un alias: revísalos y asígnalos de una vez.`
                : "Ninguno dice el nombre o un alias de una marca: asígnalos desde Productos."}
            </span>
          </p>
          {canWrite && unbrandedMatching > 0 && (
            <Button asChild variant="outline" className="min-h-11 shrink-0 bg-white">
              <Link href={`/${storeId}/marcas/sugerencias`}>Revisar sugerencias</Link>
            </Button>
          )}
        </div>
      )}

      <div role="group" aria-label="Qué marcas ver" className="flex flex-wrap gap-2">
        {(
          [
            ["activas", `Activas (${active.length})`],
            ["archivadas", `Archivadas (${archived.length})`],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={view === key ? "default" : "outline"}
            className="min-h-11"
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          {view === "activas"
            ? "Todavía no hay marcas. Crea la primera con «Nueva marca»."
            : "No hay marcas archivadas."}
        </div>
      ) : (
        <>
          <div role="table" aria-label="Marcas" className="hidden overflow-x-auto rounded-xl border bg-white lg:block">
            <div className="min-w-[860px]">
              <div role="row" className={cn(GRID, "px-3 py-3 text-sm font-medium text-muted-foreground")}>
                <span role="columnheader">Orden</span>
                <span role="columnheader">Logo</span>
                <span role="columnheader">Marca y su página</span>
                <span role="columnheader" className="text-right">
                  Productos
                </span>
                <span role="columnheader">Visible</span>
                <span role="columnheader">Compra por marca</span>
                <span role="columnheader">
                  <span className="sr-only">Acciones</span>
                </span>
              </div>
              <Reorder.Group
                as="div"
                role="rowgroup"
                axis="y"
                values={view === "activas" ? order : rows.map((brand) => brand.id)}
                onReorder={view === "activas" ? setOrder : () => undefined}
              >
                {rows.map((brand) => (
                  <DesktopRow key={brand.id} {...rowProps(brand)} />
                ))}
              </Reorder.Group>
            </div>
          </div>
          <ul className="flex flex-col gap-3 lg:hidden" aria-label="Marcas">
            {rows.map((brand) => (
              <MobileCard key={brand.id} {...rowProps(brand)} />
            ))}
          </ul>
          {sortable && (
            <p className="text-xs text-muted-foreground">
              Arrastra o usa ↑ ↓ para ordenar: así salen en «Compra por marca» y en el menú de la tienda. Las líneas van siempre debajo de su marca.
            </p>
          )}
        </>
      )}
    </TooltipProvider>
  );
};

export default BrandsClient;
