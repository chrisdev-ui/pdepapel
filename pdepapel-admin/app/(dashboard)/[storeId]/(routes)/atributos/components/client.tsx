"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Models } from "@/constants";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CategoryColumn, columns as categoryColumns } from "../../categorias/components/columns";
import { ColorColumn, columns as colorColumns } from "../../colores/components/columns";
import { DesignColumn, columns as designColumns } from "../../disenos/components/columns";
import { SizeColumn, columns as sizeColumns } from "../../tamanos/components/columns";
import { TypeColumn, columns as typeColumns } from "../../tipos/components/columns";
import { AttributeBulkActions } from "./archive-actions";

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
const DEFAULT_VIEW: AttributeView = "activos";
export const isAttributeView = (value: string | null | undefined): value is AttributeView => value === "activos" || value === "archivados";

/** Filtro puro por vista; compartido con las pruebas. */
export function filterByView<T extends { isArchived: boolean }>(rows: T[], view: AttributeView): T[] {
  return rows.filter((row) => (view === "archivados" ? row.isArchived : !row.isArchived));
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
}

const TAB_PARAM = "tab";
const DEFAULT_TAB: AttributeTab = "categorias";

/** Pestaña y vista que pide la URL (`?tab=colores&vista=archivados`). */
export function readAttributeQuery(searchParams: { get(name: string): string | null }): { tab: AttributeTab; view: AttributeView } {
  const tab = searchParams.get(TAB_PARAM);
  const view = searchParams.get(VIEW_PARAM);
  return { tab: isAttributeTab(tab) ? tab : DEFAULT_TAB, view: isAttributeView(view) ? view : DEFAULT_VIEW };
}

const AttributesClient: React.FC<AttributesClientProps> = ({ types, categories, sizes, colors, designs, options }) => {
  const params = useParams();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const storeId = String(params.storeId);

  // La URL manda: un clic en el menú lateral (`/atributos?tab=colores`) cambia
  // la pestaña aunque la página ya esté abierta. Un clic en una pestaña
  // responde de inmediato y escribe la URL con replaceState, que Next 14.2
  // refleja en useSearchParams; si aún no lo hizo, el estado local cubre el hueco.
  const requested = readAttributeQuery(searchParams);
  const [selected, setSelected] = useState<{ base: string; tab: AttributeTab; view: AttributeView } | null>(null);
  const requestedKey = `${requested.tab}|${requested.view}`;
  const tab = selected?.base === requestedKey ? selected.tab : requested.tab;
  const view = selected?.base === requestedKey ? selected.view : requested.view;

  const replaceQuery = (nextTab: AttributeTab, nextView: AttributeView) => {
    const query = new URLSearchParams(searchParams.toString());
    if (nextTab === DEFAULT_TAB) query.delete(TAB_PARAM);
    else query.set(TAB_PARAM, nextTab);
    if (nextView === DEFAULT_VIEW) query.delete(VIEW_PARAM);
    else query.set(VIEW_PARAM, nextView);
    const suffix = query.toString();
    window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
  };

  const setTab = (next: AttributeTab) => {
    setSelected({ base: requestedKey, tab: next, view });
    replaceQuery(next, view);
  };

  const setView = (next: AttributeView) => {
    setSelected({ base: requestedKey, tab, view: next });
    replaceQuery(tab, next);
  };

  const visible = {
    types: filterByView(types, view),
    categories: filterByView(categories, view),
    sizes: filterByView(sizes, view),
    colors: filterByView(colors, view),
    designs: filterByView(designs, view),
  };
  const archivedTotal = [types, categories, sizes, colors, designs].reduce((sum, rows) => sum + rows.filter((row) => row.isArchived).length, 0);
  // El resumen del encabezado siempre habla de los atributos activos, sin importar la vista.
  const active = {
    types: filterByView(types, "activos").length,
    categories: filterByView(categories, "activos").length,
    sizes: filterByView(sizes, "activos").length,
    colors: filterByView(colors, "activos").length,
    designs: filterByView(designs, "activos").length,
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

  const sections: Record<Exclude<AttributeTab, "opciones">, { create: string; createLabel: string; description: string; empty: string; table: React.ReactNode }> = {
    categorias: {
      create: `/${storeId}/tipos/new`,
      createLabel: "Nueva categoría",
      description: "Las categorías principales del menú de la tienda. El icono se guarda aparte del nombre; nunca uses emojis en el nombre.",
      empty: "Aún no hay categorías",
      table: <DataTable tableKey={Models.Types} searchPlaceholder="Buscar categoría…" columns={typeColumns} data={visible.types} getRowId={(row) => row.id} bulkActions={(table) => <AttributeBulkActions kind="types" table={table} />} emptyState={emptyActive("Aún no hay categorías", `/${storeId}/tipos/new`, "Crear la primera categoría")} />,
    },
    subcategorias: {
      create: `/${storeId}/categorias/new`,
      createLabel: "Nueva subcategoría",
      description: "Cada subcategoría pertenece a una categoría y tiene su propia URL y página SEO. Cambiar la URL conserva la anterior como alias.",
      empty: "Aún no hay subcategorías",
      table: <DataTable tableKey={Models.Categories} searchPlaceholder="Buscar subcategoría…" columns={categoryColumns} data={visible.categories} getRowId={(row) => row.id} bulkActions={(table) => <AttributeBulkActions kind="categories" table={table} />} emptyState={emptyActive("Aún no hay subcategorías", `/${storeId}/categorias/new`, "Crear la primera subcategoría")} />,
    },
    tamanos: {
      create: `/${storeId}/tamanos/new`,
      createLabel: "Nuevo tamaño",
      description: "Tamaños de uso interno (envío y SKU). Lo que el cliente ve como formato o medida vive en Opciones para clientes.",
      empty: "Aún no hay tamaños",
      table: <DataTable tableKey={Models.Sizes} searchPlaceholder="Buscar tamaño…" columns={sizeColumns} data={visible.sizes} getRowId={(row) => row.id} bulkActions={(table) => <AttributeBulkActions kind="sizes" table={table} />} emptyState={emptyActive("Aún no hay tamaños", `/${storeId}/tamanos/new`, "Crear el primer tamaño")} />,
    },
    colores: {
      create: `/${storeId}/colores/new`,
      createLabel: "Nuevo color",
      description: "Colores con su muestra. Se usan en variantes y en los filtros de la tienda.",
      empty: "Aún no hay colores",
      table: <DataTable tableKey={Models.Colors} searchPlaceholder="Buscar color…" columns={colorColumns} data={visible.colors} getRowId={(row) => row.id} bulkActions={(table) => <AttributeBulkActions kind="colors" table={table} />} emptyState={emptyActive("Aún no hay colores", `/${storeId}/colores/new`, "Crear el primer color")} />,
    },
    disenos: {
      create: `/${storeId}/disenos/new`,
      createLabel: "Nuevo diseño",
      description: "Diseños o personajes (Snoopy, Sanrio…) para variantes y filtros.",
      empty: "Aún no hay diseños",
      table: <DataTable tableKey={Models.Designs} searchPlaceholder="Buscar diseño…" columns={designColumns} data={visible.designs} getRowId={(row) => row.id} bulkActions={(table) => <AttributeBulkActions kind="designs" table={table} />} emptyState={emptyActive("Aún no hay diseños", `/${storeId}/disenos/new`, "Crear el primer diseño")} />,
    },
  };

  const current = tab === "opciones" ? null : sections[tab];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Atributos</h1>
          <p className="text-sm text-muted-foreground">
            {active.types} categorías · {active.categories} subcategorías · {active.sizes} tamaños · {active.colors} colores · {active.designs} diseños · {counts.opciones} opciones para clientes
            {archivedTotal > 0 ? ` · ${archivedTotal} archivados` : ""}.
          </p>
        </div>
        {current && (
          <Button asChild>
            <Link href={current.create}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {current.createLabel}
            </Link>
          </Button>
        )}
      </div>

      <div role="tablist" aria-label="Clases de atributo" className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1">
        {ATTRIBUTE_TABS.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
              )}
            >
              {item.label}
              <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>{counts[item.id]}</span>
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
            <div role="tablist" aria-label="Estado de los atributos" className="flex shrink-0 gap-1 rounded-full border bg-white p-1">
              {(["activos", "archivados"] as AttributeView[]).map((item) => {
                const active = item === view;
                return (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setView(item)}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
                    )}
                  >
                    {item === "activos" ? "Activos" : "Archivados"}
                    {item === "archivados" && <span className={cn("rounded-full px-1.5", active ? "bg-white/20" : "bg-muted")}>{archivedTotal}</span>}
                  </button>
                );
              })}
            </div>
          </div>
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
  );
};

export default AttributesClient;
