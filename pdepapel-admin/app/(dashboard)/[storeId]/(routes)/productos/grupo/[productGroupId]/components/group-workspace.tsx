import { cn } from "@/lib/utils";
import { productLacksIdentifier } from "@/lib/product-readiness";
import { AlertTriangle, Check } from "lucide-react";

/**
 * Encabezado y columna lateral del grupo, con el mismo lenguaje visual que el
 * taller de un producto: qué es, en qué estado está y qué le falta.
 */
export interface GroupWorkspaceProduct {
  id: string;
  name: string;
  stock: number;
  isArchived: boolean;
  gtin?: string | null;
  hasNoProductIdentifier?: boolean | null;
  images: { url: string }[];
  size?: { id: string; name: string } | null;
  color?: { id: string; name: string } | null;
  design?: { id: string; name: string } | null;
}

export interface GroupWorkspaceGroup {
  name: string;
  products: GroupWorkspaceProduct[];
}

const SECTIONS = [
  { id: "asistente", label: "Asistente de producto" },
  { id: "informacion", label: "Datos del grupo" },
  { id: "variantes", label: "Variantes" },
];

function summarize(group: GroupWorkspaceGroup, lowStockThreshold: number) {
  const products = group.products ?? [];
  const published = products.filter((product) => !product.isArchived);
  return {
    total: products.length,
    published: published.length,
    units: published.reduce((sum, product) => sum + (product.stock ?? 0), 0),
    withoutIdentifier: published.filter((product) => productLacksIdentifier(product)).length,
    withoutImage: published.filter((product) => (product.images?.length ?? 0) === 0).length,
    lowStock: published.filter(
      (product) => product.stock > 0 && product.stock <= lowStockThreshold,
    ).length,
    outOfStock: published.filter((product) => product.stock <= 0).length,
  };
}

/** Ejes que de verdad varían. No hay columna para esto: se deducen. */
function axes(group: GroupWorkspaceGroup) {
  const collect = (field: "size" | "color" | "design") =>
    new Set(
      (group.products ?? [])
        .map((product) => product[field]?.name)
        .filter((name): name is string => Boolean(name)),
    );
  return [
    { label: "Tamaño", values: collect("size") },
    { label: "Color", values: collect("color") },
    { label: "Diseño", values: collect("design") },
  ];
}

export function GroupWorkspaceHeader({
  group,
  lowStockThreshold,
}: {
  group: GroupWorkspaceGroup;
  lowStockThreshold: number;
}) {
  const stats = summarize(group, lowStockThreshold);
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="truncate text-2xl font-bold tracking-tight text-primary">
          {group.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-tint-lavender px-2 py-0.5 text-xs font-semibold text-primary">
            Grupo de variantes
          </span>
          {axes(group)
            .filter((axis) => axis.values.size > 1)
            .map((axis) => (
              <span
                key={axis.label}
                className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-primary"
              >
                {axis.label} · {axis.values.size} valores
              </span>
            ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {stats.total} {stats.total === 1 ? "variante" : "variantes"} ·{" "}
          {stats.published} publicadas · {stats.units} unidades en total
          {stats.withoutIdentifier > 0 && (
            <span className="font-semibold text-primary">
              {" "}
              · {stats.withoutIdentifier} sin identificador
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export function GroupWorkspaceAside({
  group,
  lowStockThreshold,
}: {
  group: GroupWorkspaceGroup | null;
  lowStockThreshold: number;
}) {
  const stats = group ? summarize(group, lowStockThreshold) : null;
  const checks = stats
    ? [
        {
          id: "images",
          ok: stats.withoutImage === 0,
          label: "Todas las variantes tienen imagen",
          hint: `${stats.withoutImage} sin imagen principal`,
        },
        {
          id: "identifier",
          ok: stats.withoutIdentifier === 0,
          label: "Todas tienen GTIN o la marca «sin identificador»",
          hint: `${stats.withoutIdentifier} la rechazaría Google Merchant`,
        },
        {
          id: "stock",
          ok: stats.lowStock === 0 && stats.outOfStock === 0,
          label: "Ninguna variante está por acabarse",
          hint: `${stats.lowStock} en stock crítico · ${stats.outOfStock} agotadas`,
        },
      ]
    : [];
  const pending = checks.filter((check) => !check.ok).length;

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
      <nav
        aria-label="Secciones del grupo"
        className="rounded-xl border bg-white p-2 shadow-sm"
      >
        <ul className="flex flex-col gap-0.5">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium text-primary hover:bg-accent"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {stats && (
        <section
          aria-labelledby="salud-grupo-titulo"
          className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h2 id="salud-grupo-titulo" className="text-sm font-bold text-primary">
              Salud del grupo
            </h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-bold text-primary",
                pending === 0 ? "bg-tint-mint" : "bg-tint-cream",
              )}
            >
              {pending === 0 ? "Al día" : `Faltan ${pending}`}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2 text-[13px]">
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary",
                    check.ok ? "bg-tint-mint" : "bg-tint-cream",
                  )}
                  aria-hidden="true"
                >
                  {check.ok ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                </span>
                <span className="flex flex-col">
                  <span className={cn(!check.ok && "font-semibold text-primary")}>
                    {check.label}
                  </span>
                  {!check.ok && (
                    <span className="text-xs text-muted-foreground">{check.hint}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Cada variante es un producto real: se abre y se edita por su cuenta.
          </p>
        </section>
      )}
    </aside>
  );
}
