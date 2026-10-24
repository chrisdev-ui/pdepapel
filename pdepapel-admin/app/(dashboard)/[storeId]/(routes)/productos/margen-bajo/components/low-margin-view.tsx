import Link from "next/link";

import { TabNav } from "@/components/ui/tab-nav";
import { BOLD_ONLINE_FEE } from "@/lib/gateway-fees";
import type { LowMarginPage } from "@/lib/low-margin-list";
import type { LowMarginRow, LowMarginSection } from "@/lib/pricing/low-margin";

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CO")}`;
const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`);

/** El fijo de Bold en línea con IVA ($1.071 hoy), de la misma tabla que cobra. */
const BOLD_FIXED_WITH_VAT = Math.round(BOLD_ONLINE_FEE.fixed * (1 + BOLD_ONLINE_FEE.vat));

function sectionLabel(section: LowMarginSection, minimoPct: number | null) {
  const minimum = minimoPct ?? 40;
  return {
    "oferta-bajo-costo": "Ofertas que venden bajo el costo",
    "bajo-costo": "Bajo el costo",
    "bajo-minimo": `Bajo ${minimum} % antes de Bold`,
    "solo-bold": `Bajo ${minimum} % solo por Bold`,
    kits: "Kits",
  }[section];
}

function sectionNote(section: LowMarginSection, minimoPct: number | null) {
  switch (section) {
    case "oferta-bajo-costo":
      return "Con su precio normal cubren el costo; con la oferta vigente se venden por debajo.";
    case "bajo-costo":
      return "El precio de hoy no alcanza a cubrir el costo de compra más el envío por unidad.";
    case "bajo-minimo":
      return `Su margen antes de la comisión de pago ya está por debajo del ${minimoPct} % de Configuración.`;
    case "solo-bold":
      return `Antes de Bold llegan al ${minimoPct} %. Bold cobra un fijo de ${money(BOLD_FIXED_WITH_VAT)} por pago (con IVA) además del porcentaje; aquí ese fijo se carga entero a una sola unidad, como si el pedido trajera solo ese producto. En un pedido con más productos se reparte, y en transferencia o efectivo no se cobra.`;
    case "kits":
      return "El costo de un kit es la suma de sus piezas. Un kit armado para rotar inventario puede quedar bajo el mínimo a propósito.";
  }
}

function minimumColumn(section: LowMarginSection | null, minimoPct: number | null) {
  return section === "solo-bold" ? `Para ${minimoPct} % con Bold (1 unidad)` : `Para ${minimoPct} %`;
}

function minimumValue(row: LowMarginRow, section: LowMarginSection | null) {
  const value = section === "solo-bold" ? row.precioParaMinimoConBold : row.precioParaMinimo;
  return value === null ? "—" : money(value);
}

function PriceCell({ row }: { row: LowMarginRow }) {
  if (row.precioOferta === null) return <>{money(row.precio)}</>;
  return (
    <span className="flex flex-col">
      <span className="font-semibold">{money(row.precioOferta)}</span>
      <span className="text-xs text-muted-foreground">
        <s>{money(row.precio)}</s>
        {row.oferta ? ` · ${row.oferta}` : " · en oferta"}
      </span>
    </span>
  );
}

export function LowMarginView({ storeId, data }: { storeId: string; data: LowMarginPage }) {
  const base = `/${storeId}/productos/margen-bajo`;
  const href = (section: LowMarginSection, page = 1) => `${base}?seccion=${section}${page > 1 ? `&pagina=${page}` : ""}`;
  const { minimoPct, section, counts } = data;
  const visible: LowMarginSection[] = minimoPct === null ? ["oferta-bajo-costo", "bajo-costo", "kits"] : ["oferta-bajo-costo", "bajo-costo", "bajo-minimo", "kits"];
  const productHref = (row: LowMarginRow) => `/${storeId}/productos/${row.id}`;
  const showMinimum = minimoPct !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Margen bajo</h1>
        <p className="text-sm font-semibold text-foreground">Esto es solo una guía: ningún precio se cambia solo.</p>
        <p className="text-sm text-muted-foreground">
          {minimoPct === null
            ? "No tienes un margen mínimo en Configuración: solo se muestran los productos bajo el costo y los kits."
            : `El mínimo de la tienda es ${minimoPct} % (Configuración) y se mide antes de la comisión de pago. El precio que cuenta es el de hoy en la tienda, con ofertas; el costo es el de compra más el envío por unidad.`}
          {data.sinCosto > 0 ? ` ${data.sinCosto} ${data.sinCosto === 1 ? "producto no tiene" : "productos no tienen"} costo y no se ${data.sinCosto === 1 ? "evalúa" : "evalúan"}.` : null}
        </p>
      </div>

      <TabNav
        label="Secciones de margen bajo"
        activeId={section ?? ""}
        items={[...visible, ...(section === "solo-bold" ? (["solo-bold"] as const) : [])].map((id) => ({ id, label: `${sectionLabel(id, minimoPct)} (${counts[id]})`, href: href(id) }))}
      />

      {minimoPct !== null && section !== "solo-bold" ? (
        <details className="rounded-2xl border bg-white p-4 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary">
            {sectionLabel("solo-bold", minimoPct)} ({counts["solo-bold"]})
          </summary>
          <p className="mt-2 text-muted-foreground">{sectionNote("solo-bold", minimoPct)}</p>
          {counts["solo-bold"] > 0 ? (
            <Link href={href("solo-bold")} className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
              Ver la lista ({counts["solo-bold"]})
            </Link>
          ) : null}
        </details>
      ) : null}

      {section ? (
        <section aria-labelledby="margen-bajo-seccion" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="margen-bajo-seccion" className="text-lg font-semibold text-primary">
              {sectionLabel(section, minimoPct)} ({data.total})
            </h2>
            <p className="text-sm text-muted-foreground">{sectionNote(section, minimoPct)}</p>
          </div>

          {data.rows.length === 0 ? (
            <p className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Ningún producto en esta sección.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2 lg:hidden" aria-label={sectionLabel(section, minimoPct)}>
                {data.rows.map((row) => (
                  <li key={row.id} className="rounded-2xl border bg-white p-3 text-sm">
                    <Link href={productHref(row)} className="flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
                      {row.nombre}
                    </Link>
                    {row.categoria ? <p className="text-xs text-muted-foreground">{row.categoria}</p> : null}
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                      <dt className="text-muted-foreground">Precio</dt>
                      <dd><PriceCell row={row} /></dd>
                      <dt className="text-muted-foreground">Costo</dt>
                      <dd>{row.costo === null ? "—" : money(row.costo)}</dd>
                      <dt className="text-muted-foreground">Margen</dt>
                      <dd>{percent(row.margenPct)}</dd>
                      <dt className="text-muted-foreground">Con Bold (1 unidad)</dt>
                      <dd>{percent(row.margenBoldPct)}</dd>
                      {showMinimum ? (
                        <>
                          <dt className="text-muted-foreground">{minimumColumn(section, minimoPct)}</dt>
                          <dd>{minimumValue(row, section)}</dd>
                        </>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto rounded-2xl border bg-white lg:block">
                <table className="w-full text-sm">
                  <caption className="sr-only">{sectionLabel(section, minimoPct)}</caption>
                  <thead className="border-b text-left text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Producto</th>
                      <th scope="col" className="px-4 py-3 font-medium">Precio</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Costo</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Margen</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Con Bold (1 unidad)</th>
                      {showMinimum ? <th scope="col" className="px-4 py-3 text-right font-medium">{minimumColumn(section, minimoPct)}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <Link href={productHref(row)} className="font-semibold text-primary underline-offset-4 hover:underline">
                            {row.nombre}
                          </Link>
                          {row.categoria ? <p className="text-xs text-muted-foreground">{row.categoria}</p> : null}
                        </td>
                        <td className="px-4 py-3"><PriceCell row={row} /></td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.costo === null ? "—" : money(row.costo)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{percent(row.margenPct)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{percent(row.margenBoldPct)}</td>
                        {showMinimum ? <td className="px-4 py-3 text-right tabular-nums">{minimumValue(row, section)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.pageCount > 1 ? (
                <nav aria-label="Páginas" className="flex flex-wrap items-center gap-3 text-sm">
                  {data.page > 1 ? (
                    <Link href={href(section, data.page - 1)} className="inline-flex min-h-11 items-center rounded-full border bg-white px-4 font-semibold text-primary">
                      Anterior
                    </Link>
                  ) : null}
                  <span className="text-muted-foreground">
                    Página {data.page} de {data.pageCount}
                  </span>
                  {data.page < data.pageCount ? (
                    <Link href={href(section, data.page + 1)} className="inline-flex min-h-11 items-center rounded-full border bg-white px-4 font-semibold text-primary">
                      Siguiente
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <p className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Ningún producto está bajo el costo ni bajo el mínimo.</p>
      )}
    </div>
  );
}
