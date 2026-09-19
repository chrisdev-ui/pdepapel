"use client";

import type { Row } from "@tanstack/react-table";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Models } from "@/constants";
import { generateAllSizeCombinations } from "@/constants/sizes";
import type { AttributeKind } from "@/lib/attribute-archive";
import { ATTRIBUTE_FILTER_OPTIONS, computeAttributeHints, hintMatchesFilter, usageShare, type AttributeHintInput } from "@/lib/attribute-hints";
import { cn } from "@/lib/utils";
import { CategoryColumn, StorePageBadge, columns as categoryColumns } from "../../categorias/components/columns";
import { CellAction as CategoryCellAction } from "../../categorias/components/cell-action";
import { ColorColumn, ColorSwatch, columns as colorColumns } from "../../colores/components/columns";
import { CellAction as ColorCellAction } from "../../colores/components/cell-action";
import { DesignColumn, columns as designColumns } from "../../disenos/components/columns";
import { CellAction as DesignCellAction } from "../../disenos/components/cell-action";
import { SizeColumn, columns as sizeColumns, describeSizeValue } from "../../tamanos/components/columns";
import { CellAction as SizeCellAction } from "../../tamanos/components/cell-action";
import { TypeColumn, TypeIconBubble, columns as typeColumns } from "../../tipos/components/columns";
import { CellAction as TypeCellAction } from "../../tipos/components/cell-action";
import { AttributeBulkActions } from "./archive-actions";
import { AttributeActionsProvider } from "./attribute-actions";
import { AttributeMobileCard, formatRelativeDate, type Decorated } from "./attribute-cells";

export type AttributeTab = "categorias" | "subcategorias" | "tamanos" | "colores" | "disenos" | "opciones";

export const ATTRIBUTE_TABS: { id: AttributeTab; label: string }[] = [
  { id: "categorias", label: "Categorías" },
  { id: "subcategorias", label: "Subcategorías" },
  { id: "tamanos", label: "Tamaños" },
  { id: "colores", label: "Colores" },
  { id: "disenos", label: "Diseños" },
  { id: "opciones", label: "Opciones para clientes" },
];

export const isAttributeTab = (value: string | null | undefined): value is AttributeTab => ATTRIBUTE_TABS.some((t) => t.id === value);

export type AttributeView = "activos" | "archivados";
const VIEW_PARAM = "vista";
const TYPE_PARAM = "categoria";
const DEFAULT_VIEW: AttributeView = "activos";
export const isAttributeView = (value: string | null | undefined): value is AttributeView => value === "activos" || value === "archivados";

/** Filtro puro por vista; compartido con las pruebas. */
export function filterByView<T extends { isArchived: boolean }>(rows: T[], view: AttributeView): T[] {
  return rows.filter((row) => (view === "archivados" ? row.isArchived : !row.isArchived));
}

/**
 * Añade a cada fila sus pistas de limpieza, el uso y la proporción frente a la
 * fila más usada. `usageOf` es lo que bloquea Eliminar (productos, o
 * subcategorías en categorías); `barOf` lo que pinta la barra.
 */
export function decorateAttributeRows<T extends { id: string; name: string; isArchived: boolean }>(
  kind: AttributeKind,
  rows: readonly T[],
  usageOf: (row: T) => number,
  extra?: (row: T) => Partial<Pick<AttributeHintInput, "value" | "icon" | "iconSvg">>,
  barOf: (row: T) => number = usageOf,
): Decorated<T>[] {
  const hints = computeAttributeHints(
    kind,
    rows.map((row) => ({ id: row.id, name: row.name, isArchived: row.isArchived, usage: usageOf(row), ...(extra?.(row) ?? {}) })),
  );
  const max = rows.reduce((top, row) => Math.max(top, barOf(row)), 0);
  return rows.map((row) => ({ ...row, hints: hints.get(row.id) ?? [], usage: usageOf(row), share: usageShare(barOf(row), max) }));
}

interface CatalogOptionRow {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  values: { id: string; name: string; value: string }[];
  _count: { productValues: number; categories: number };
}

interface AttributesClientProps {
  types: TypeColumn[];
  categories: CategoryColumn[];
  sizes: SizeColumn[];
  colors: ColorColumn[];
  designs: DesignColumn[];
  options: CatalogOptionRow[];
  /** URL pública de la tienda para «Ver en la tienda». */
  storeUrl?: string | null;
}

const TAB_PARAM = "tab";
const DEFAULT_TAB: AttributeTab = "categorias";

/** Pestaña y vista que pide la URL (`?tab=colores&vista=archivados`). */
export function readAttributeQuery(searchParams: { get(name: string): string | null }): { tab: AttributeTab; view: AttributeView; typeId: string | null } {
  const tab = searchParams.get(TAB_PARAM);
  const view = searchParams.get(VIEW_PARAM);
  const typeId = searchParams.get(TYPE_PARAM);
  return { tab: isAttributeTab(tab) ? tab : DEFAULT_TAB, view: isAttributeView(view) ? view : DEFAULT_VIEW, typeId: typeId || null };
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/** Filtro «Revisar» de una familia con el conteo de cada pista entre las filas visibles. */
function reviewFilter<T extends { hints: { kind: string }[] }>(kind: AttributeKind, rows: readonly T[]) {
  const options = ATTRIBUTE_FILTER_OPTIONS[kind]
    .map((option) => ({ ...option, count: rows.filter((row) => hintMatchesFilter(row.hints as never, [option.value])).length }))
    .filter((option) => option.count > 0)
    .map((option) => ({ label: `${option.label} (${option.count})`, value: option.value }));
  return options.length > 0 ? [{ columnKey: "name", title: "Revisar", options }] : [];
}

const AttributesClient: React.FC<AttributesClientProps> = ({ types, categories, sizes, colors, designs, options, storeUrl = null }) => {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const storeId = String(params.storeId);

  // La URL manda: un clic en el menú lateral (`/atributos?tab=colores`) cambia
  // la pestaña aunque la página ya esté abierta. Un clic en una pestaña
  // responde de inmediato y escribe la URL con replaceState, que Next 14.2
  // refleja en useSearchParams; si aún no lo hizo, el estado local cubre el hueco.
  const requested = readAttributeQuery(searchParams);
  const [selected, setSelected] = useState<{ base: string; tab: AttributeTab; view: AttributeView; typeId: string | null } | null>(null);
  const requestedKey = `${requested.tab}|${requested.view}|${requested.typeId ?? ""}`;
  const tab = selected?.base === requestedKey ? selected.tab : requested.tab;
  const view = selected?.base === requestedKey ? selected.view : requested.view;
  const typeFilterId = selected?.base === requestedKey ? selected.typeId : requested.typeId;

  const replaceQuery = (nextTab: AttributeTab, nextView: AttributeView, nextTypeId: string | null) => {
    const query = new URLSearchParams(searchParams.toString());
    if (nextTab === DEFAULT_TAB) query.delete(TAB_PARAM);
    else query.set(TAB_PARAM, nextTab);
    if (nextView === DEFAULT_VIEW) query.delete(VIEW_PARAM);
    else query.set(VIEW_PARAM, nextView);
    if (nextTypeId && nextTab === "subcategorias") query.set(TYPE_PARAM, nextTypeId);
    else query.delete(TYPE_PARAM);
    const suffix = query.toString();
    window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
  };

  const setTab = (next: AttributeTab) => {
    const nextTypeId = next === "subcategorias" ? typeFilterId : null;
    setSelected({ base: requestedKey, tab: next, view, typeId: nextTypeId });
    replaceQuery(next, view, nextTypeId);
  };

  const setView = (next: AttributeView) => {
    setSelected({ base: requestedKey, tab, view: next, typeId: typeFilterId });
    replaceQuery(tab, next, typeFilterId);
  };

  const clearTypeFilter = () => {
    setSelected({ base: requestedKey, tab, view, typeId: null });
    replaceQuery(tab, view, null);
  };

  // Pistas y proporción de uso se calculan con todas las filas de la familia
  // (activas y archivadas) para que la barra no cambie al cambiar de vista.
  const decorated = useMemo(
    () => ({
      types: decorateAttributeRows("types", types, (row) => row.activeCategoriesCount, (row) => ({ icon: row.icon, iconSvg: row.iconSvg }), (row) => row.productsCount),
      categories: decorateAttributeRows("categories", categories, (row) => row._count.products),
      sizes: decorateAttributeRows("sizes", sizes, (row) => row._count.products),
      colors: decorateAttributeRows("colors", colors, (row) => row._count.products, (row) => ({ value: row.value })),
      designs: decorateAttributeRows("designs", designs, (row) => row._count.products),
    }),
    [types, categories, sizes, colors, designs],
  );

  const typeFilter = typeFilterId ? types.find((row) => row.id === typeFilterId) ?? null : null;
  const visible = {
    types: filterByView(decorated.types, view),
    categories: filterByView(decorated.categories, view).filter((row) => !typeFilter || row.typeId === typeFilter.id),
    sizes: filterByView(decorated.sizes, view),
    colors: filterByView(decorated.colors, view),
    designs: filterByView(decorated.designs, view),
  };
  const archivedTotal = [types, categories, sizes, colors, designs].reduce((sum, rows) => sum + rows.filter((row) => row.isArchived).length, 0);
  // El resumen del encabezado siempre habla de los atributos activos, sin importar la vista.
  const active = {
    types: filterByView(types, "activos"),
    categories: filterByView(categories, "activos"),
    sizes: filterByView(sizes, "activos"),
    colors: filterByView(colors, "activos"),
    designs: filterByView(designs, "activos"),
  };

  const counts: Record<AttributeTab, number> = {
    categorias: visible.types.length,
    subcategorias: visible.categories.length,
    tamanos: visible.sizes.length,
    colores: visible.colors.length,
    disenos: visible.designs.length,
    opciones: options.length,
  };
  const emptyArchived = { title: "Nada archivado aquí", description: "Archiva un atributo desde su menú de fila o en lote; seguirá en los productos que ya lo usan." };

  /** Estado vacío de la vista activa: siempre ofrece crear el primero. */
  const emptyActive = (title: string, create: string, createFirstLabel: string) =>
    view === "archivados"
      ? emptyArchived
      : {
          title,
          action: (
            <Button asChild>
              <Link href={create}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {createFirstLabel}
              </Link>
            </Button>
          ),
        };

  // Con las 10 combinaciones creadas (5 dimensiones × 2 pesos) no hay tamaño nuevo posible.
  const missingSizes = generateAllSizeCombinations().filter((combination) => !sizes.some((size) => size.value === combination.value));

  const typeFilterOptions = Array.from(new Set(categories.map((row) => row.type.name)))
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((name) => ({ label: name, value: name }));

  const productsLabel = (count: number) => (count === 1 ? "producto" : "productos");

  const sections: Record<Exclude<AttributeTab, "opciones">, { create: string; createLabel: string; createDisabledReason?: string; description: string; table: React.ReactNode }> = {
    categorias: {
      create: `/${storeId}/tipos/nuevo`,
      createLabel: "Nueva categoría",
      description: "Las categorías principales del menú de la tienda. El icono se guarda aparte del nombre; nunca uses emojis en el nombre.",
      table: (
        <DataTable
          tableKey={Models.Types}
          searchPlaceholder="Buscar categoría…"
          columns={typeColumns}
          data={visible.types}
          getRowId={(row) => row.id}
          filters={reviewFilter("types", visible.types)}
          bulkActions={(table) => <AttributeBulkActions kind="types" table={table} />}
          renderMobileCard={(row: Row<Decorated<TypeColumn>>) => (
            <AttributeMobileCard
              row={row}
              href={`/${storeId}/tipos/${row.original.id}`}
              title={row.original.name}
              leading={<TypeIconBubble row={row.original} />}
              meta={`${plural(row.original._count.categories, "subcategoría", "subcategorías")} · ${formatRelativeDate(row.original.updatedAt)}`}
              hints={row.original.hints}
              usage={row.original.productsCount}
              usageLabel={productsLabel(row.original.productsCount)}
              share={row.original.share}
              isArchived={row.original.isArchived}
              actions={<TypeCellAction data={row.original} />}
            />
          )}
          emptyState={emptyActive("Aún no hay categorías", `/${storeId}/tipos/nuevo`, "Crear la primera categoría")}
        />
      ),
    },
    subcategorias: {
      create: `/${storeId}/categorias/nuevo`,
      createLabel: "Nueva subcategoría",
      description: "Cada subcategoría pertenece a una categoría y tiene su propia URL y página SEO. Cambiar la URL conserva la anterior como alias.",
      table: (
        <DataTable
          tableKey={Models.Categories}
          searchPlaceholder="Buscar subcategoría…"
          columns={categoryColumns}
          data={visible.categories}
          getRowId={(row) => row.id}
          filters={[
            ...(typeFilterOptions.length > 1 && !typeFilter ? [{ columnKey: "type", title: "Categoría", options: typeFilterOptions }] : []),
            {
              columnKey: "seo",
              title: "Página en la tienda",
              options: [
                { label: "Indexada y destacada", value: "destacada" },
                { label: "Indexada", value: "indexada" },
                { label: "No indexada", value: "no-indexada" },
              ],
            },
            ...reviewFilter("categories", visible.categories),
          ]}
          bulkActions={(table) => <AttributeBulkActions kind="categories" table={table} />}
          renderMobileCard={(row: Row<Decorated<CategoryColumn>>) => (
            <AttributeMobileCard
              row={row}
              href={`/${storeId}/categorias/${row.original.id}`}
              title={row.original.name}
              meta={
                <span className="flex flex-wrap items-center gap-1.5">
                  {row.original.type.name}
                  <StorePageBadge row={row.original} />
                </span>
              }
              hints={row.original.hints}
              usage={row.original.usage}
              usageLabel={productsLabel(row.original.usage)}
              share={row.original.share}
              isArchived={row.original.isArchived}
              actions={<CategoryCellAction data={row.original} />}
            />
          )}
          emptyState={emptyActive("Aún no hay subcategorías", `/${storeId}/categorias/nuevo`, "Crear la primera subcategoría")}
        />
      ),
    },
    tamanos: {
      create: `/${storeId}/tamanos/nuevo`,
      createLabel: "Nuevo tamaño",
      createDisabledReason: missingSizes.length === 0 ? "Las 10 combinaciones de dimensión y peso ya existen." : undefined,
      description: "Tamaños de uso interno (envío y SKU). Lo que el cliente ve como formato o medida vive en Opciones para clientes.",
      table: (
        <DataTable
          tableKey={Models.Sizes}
          searchPlaceholder="Buscar tamaño…"
          columns={sizeColumns}
          data={visible.sizes}
          getRowId={(row) => row.id}
          filters={reviewFilter("sizes", visible.sizes)}
          bulkActions={(table) => <AttributeBulkActions kind="sizes" table={table} />}
          renderMobileCard={(row: Row<Decorated<SizeColumn>>) => {
            const described = describeSizeValue(row.original.value);
            return (
              <AttributeMobileCard
                row={row}
                href={`/${storeId}/tamanos/${row.original.id}`}
                title={row.original.name}
                meta={`${row.original.value} · ${described.dimension} · ${described.weight}`}
                hints={row.original.hints}
                usage={row.original.usage}
                usageLabel={productsLabel(row.original.usage)}
                share={row.original.share}
                isArchived={row.original.isArchived}
                actions={<SizeCellAction data={row.original} />}
              />
            );
          }}
          emptyState={emptyActive("Aún no hay tamaños", `/${storeId}/tamanos/nuevo`, "Crear el primer tamaño")}
        />
      ),
    },
    colores: {
      create: `/${storeId}/colores/nuevo`,
      createLabel: "Nuevo color",
      description: "Colores con su muestra. Se usan en variantes y en los filtros de la tienda.",
      table: (
        <DataTable
          tableKey={Models.Colors}
          searchPlaceholder="Buscar color…"
          columns={colorColumns}
          data={visible.colors}
          getRowId={(row) => row.id}
          filters={reviewFilter("colors", visible.colors)}
          bulkActions={(table) => <AttributeBulkActions kind="colors" table={table} />}
          renderMobileCard={(row: Row<Decorated<ColorColumn>>) => (
            <AttributeMobileCard
              row={row}
              href={`/${storeId}/colores/${row.original.id}`}
              title={row.original.name}
              leading={<ColorSwatch value={row.original.value} className="mt-0.5 h-7 w-7" />}
              meta={`${row.original.value} · ${formatRelativeDate(row.original.updatedAt)}`}
              hints={row.original.hints}
              usage={row.original.usage}
              usageLabel={productsLabel(row.original.usage)}
              share={row.original.share}
              isArchived={row.original.isArchived}
              actions={<ColorCellAction data={row.original} />}
            />
          )}
          emptyState={emptyActive("Aún no hay colores", `/${storeId}/colores/nuevo`, "Crear el primer color")}
        />
      ),
    },
    disenos: {
      create: `/${storeId}/disenos/nuevo`,
      createLabel: "Nuevo diseño",
      description: "Diseños o personajes (Snoopy, Sanrio…) para variantes y filtros.",
      table: (
        <DataTable
          tableKey={Models.Designs}
          searchPlaceholder="Buscar diseño…"
          columns={designColumns}
          data={visible.designs}
          getRowId={(row) => row.id}
          filters={reviewFilter("designs", visible.designs)}
          bulkActions={(table) => <AttributeBulkActions kind="designs" table={table} />}
          renderMobileCard={(row: Row<Decorated<DesignColumn>>) => (
            <AttributeMobileCard
              row={row}
              href={`/${storeId}/disenos/${row.original.id}`}
              title={row.original.name}
              meta={formatRelativeDate(row.original.updatedAt)}
              hints={row.original.hints}
              usage={row.original.usage}
              usageLabel={productsLabel(row.original.usage)}
              share={row.original.share}
              isArchived={row.original.isArchived}
              actions={<DesignCellAction data={row.original} />}
            />
          )}
          emptyState={emptyActive("Aún no hay diseños", `/${storeId}/disenos/nuevo`, "Crear el primer diseño")}
        />
      ),
    },
  };

  const current = tab === "opciones" ? null : sections[tab];
  const candidates = {
    categories: active.categories.map((row) => ({ id: row.id, name: row.name, usage: row._count.products, parent: row.type.name })),
    sizes: active.sizes.map((row) => ({ id: row.id, name: row.name, usage: row._count.products })),
    colors: active.colors.map((row) => ({ id: row.id, name: row.name, usage: row._count.products, value: row.value })),
    designs: active.designs.map((row) => ({ id: row.id, name: row.name, usage: row._count.products })),
  };

  return (
    <AttributeActionsProvider storeId={storeId} storeUrl={storeUrl} candidates={candidates} types={active.types.map((row) => ({ id: row.id, name: row.name }))} onDone={() => router.refresh()}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Atributos</h1>
            <p className="text-sm text-muted-foreground">
              {active.types.length} categorías · {active.categories.length} subcategorías · {active.sizes.length} tamaños · {active.colors.length} colores · {active.designs.length} diseños · {counts.opciones} opciones para clientes
              {archivedTotal > 0 ? ` · ${archivedTotal} archivados` : ""}.
            </p>
          </div>
          {current && (
            <div className="flex flex-col items-start gap-1 lg:items-end">
              {current.createDisabledReason ? (
                <Button type="button" disabled title={current.createDisabledReason}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {current.createLabel}
                </Button>
              ) : (
                <Button asChild>
                  <Link href={current.create}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {current.createLabel}
                  </Link>
                </Button>
              )}
              {current.createDisabledReason && <span className="text-xs text-muted-foreground">{current.createDisabledReason}</span>}
            </div>
          )}
        </div>

        {/* En celular las seis pestañas no caben: un selector con todas y su conteo. */}
        <div className="sm:hidden">
          <label htmlFor="attribute-tab" className="mb-1 block text-xs font-semibold text-muted-foreground">
            Qué atributo ver
          </label>
          <Select value={tab} onValueChange={(value) => isAttributeTab(value) && setTab(value)}>
            <SelectTrigger id="attribute-tab" className="h-11 bg-white font-semibold" aria-label="Qué atributo ver">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTRIBUTE_TABS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label} · {counts[item.id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div role="tablist" aria-label="Clases de atributo" className="hidden max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1 sm:flex">
          {ATTRIBUTE_TABS.map((item) => {
            const isActive = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
                )}
              >
                {item.label}
                <span className={cn("rounded-full px-1.5 text-xs", isActive ? "bg-white/20" : "bg-muted")}>{counts[item.id]}</span>
              </button>
            );
          })}
        </div>

        {current ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {view === "archivados"
                  ? "Archivados: no se ofrecen en formularios ni en la tienda, pero los productos que los usan siguen igual. Restáuralos cuando los necesites."
                  : current.description}
              </p>
              <div role="tablist" aria-label="Estado de los atributos" className="flex shrink-0 gap-1 self-start rounded-full border bg-white p-1 sm:self-auto">
                {(["activos", "archivados"] as AttributeView[]).map((item) => {
                  const isActive = item === view;
                  return (
                    <button
                      key={item}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setView(item)}
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
                      )}
                    >
                      {item === "activos" ? "Activos" : "Archivados"}
                      {item === "archivados" && <span className={cn("rounded-full px-1.5", isActive ? "bg-white/20" : "bg-muted")}>{archivedTotal}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            {tab === "subcategorias" && typeFilter && (
              <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm">
                <span>
                  Subcategorías de <span className="font-semibold">«{typeFilter.name}»</span>
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={clearTypeFilter}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  Ver todas
                </Button>
              </div>
            )}
            {current.table}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Lo que el cliente ve como formato, capacidad, medida, cantidad o punta. Se asignan a cada producto en su formulario; la migración masiva desde los tamaños internos vive en{" "}
              <Link href={`/${storeId}/productos/opciones`} className="font-semibold text-primary hover:underline">Productos › Opciones para clientes</Link>.
            </p>
            {options.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border bg-white px-6 py-10 text-center">
                <p className="text-sm font-semibold">Aún no hay opciones para clientes</p>
                <p className="text-sm text-muted-foreground">Empieza la migración segura desde Productos › Opciones para clientes.</p>
                <Button asChild variant="outline"><Link href={`/${storeId}/productos/opciones`}>Ir a la migración</Link></Button>
              </div>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {options.map((option) => (
                  <li key={option.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-primary">{option.name}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold text-primary", option.isActive ? "bg-tint-mint" : "bg-muted")}>{option.isActive ? "Activa" : "Inactiva"}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {option.values.slice(0, 8).map((value) => (
                        <span key={value.id} className="rounded-full bg-tint-lavender px-2 py-0.5 text-xs font-medium text-primary">{value.name}</span>
                      ))}
                      {option.values.length > 8 && <span className="text-xs text-muted-foreground">+{option.values.length - 8}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {option._count.productValues} productos · {option._count.categories} subcategorías · clave {option.key}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </AttributeActionsProvider>
  );
};

export default AttributesClient;
