import { getProductReadiness } from "@/lib/product-readiness";
import { cn, currencyFormatter } from "@/lib/utils";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import Link from "next/link";

interface WorkspaceProduct {
  id: string;
  name: string;
  sku?: string | null;
  slug?: string | null;
  price: number;
  acqPrice?: number | null;
  stock: number;
  isArchived: boolean;
  isKit?: boolean | null;
  productGroupId?: string | null;
  categoryId?: string | null;
  gtin?: string | null;
  hasNoProductIdentifier?: boolean | null;
  description?: string | null;
  images: { url: string }[];
}

/** Secciones de la ficha en el orden en que se pintan; las opcionales dependen del producto. */
export function productFormSections(
  product: { id?: string; isKit?: boolean | null } | null,
) {
  const editing = Boolean(product?.id);
  return [
    { id: "imagenes", label: "Fotos" },
    { id: "asistente", label: "Asistente de producto" },
    { id: "informacion", label: "Nombre y URL" },
    { id: "precio", label: "Precio y costo" },
    {
      id: "composicion",
      label: product?.isKit ? "Composición del kit" : "Kit",
    },
    { id: "inventario", label: "Inventario" },
    { id: "identificadores", label: "Identificadores" },
    { id: "clasificacion", label: "Clasificación y atributos" },
    { id: "visibilidad", label: "Visibilidad" },
    ...(editing ? [{ id: "preventa", label: "Preventa" }] : []),
    { id: "descripcion", label: "Descripción" },
    ...(editing
      ? [
          { id: "zona-de-cuidado", label: "Zona de cuidado" },
          { id: "resenas", label: "Reseñas" },
        ]
      : []),
  ];
}

export function ProductWorkspaceAside({
  product,
  storeId,
}: {
  product: WorkspaceProduct | null;
  storeId: string;
}) {
  const readiness = product ? getProductReadiness(product) : null;
  const photoCount = product?.images?.length ?? 0;
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
      <nav
        aria-label="Secciones del producto"
        className="rounded-xl border bg-white p-2 shadow-sm"
      >
        <ul className="flex flex-col gap-0.5">
          {productFormSections(product).map((section) => (
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
      <section
        aria-labelledby="asistente-titulo"
        className="flex flex-col gap-2 rounded-xl border border-tint-lavender bg-tint-lavender/25 p-4 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Sparkles
            className="h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <h2 id="asistente-titulo" className="text-sm font-bold text-primary">
            Asistente de producto
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {photoCount > 0
            ? `Lee ${photoCount === 1 ? "la foto" : `las ${photoCount} fotos`} y propone nombre, marca, clasificación, descripción y el código de barras impreso.`
            : "Sube una foto y la IA propone nombre, marca, clasificación, descripción y el código de barras impreso."}
        </p>
        <a
          href="#asistente"
          className="text-[13px] font-semibold text-primary hover:underline"
        >
          {photoCount > 0 ? "Analizar fotos con IA" : "Ir al asistente"}
        </a>
        <p className="text-[11px] text-muted-foreground">
          Tú apruebas campo por campo. Nada se guarda solo.
        </p>
      </section>
      {readiness && (
        <section
          aria-labelledby="listo-titulo"
          className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h2 id="listo-titulo" className="text-sm font-bold text-primary">
              Listo para vender
            </h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-bold text-primary",
                readiness.complete ? "bg-tint-mint" : "bg-tint-cream",
              )}
            >
              {readiness.done} de {readiness.total}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {readiness.checks.map((check) => (
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
                  <span
                    className={cn(!check.ok && "font-semibold text-primary")}
                  >
                    {check.label}
                  </span>
                  {!check.ok && check.hint && (
                    <span className="text-xs text-muted-foreground">
                      {check.hint}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Google Merchant necesita imagen, precio e identificador para
            mostrarlo.
          </p>
        </section>
      )}
      {product && (
        <Link
          href={`/${storeId}/movimientos-inventario/producto/${product.id}`}
          className="text-[13px] font-semibold text-primary hover:underline"
        >
          Ver kardex del producto
        </Link>
      )}
    </aside>
  );
}
