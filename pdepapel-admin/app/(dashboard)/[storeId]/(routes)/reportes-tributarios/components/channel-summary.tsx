import { SectionCard } from "@/components/ui/section-card";
import type { summarizeTaxSalesByChannel, TaxSaleChannel } from "@/lib/tax-report-channels";
import { currencyFormatter } from "@/lib/utils";

const LINE_LABELS: Record<TaxSaleChannel, string> = {
  "Tienda en línea": "Tienda en línea",
  "Punto de venta": "Punto de venta",
  Feria: "Ferias",
  "Mercado Libre": "Mercado Libre",
};

const plural = (count: number) => `${count} venta${count === 1 ? "" : "s"}`;

/** Ventas del periodo por canal; punto de venta y ferias por separado y su total presencial. */
export function TaxChannelSummary({ channels }: { channels: ReturnType<typeof summarizeTaxSalesByChannel> }) {
  const line = (channel: TaxSaleChannel) => channels.lines.find((item) => item.channel === channel);
  const row = (label: string, count: number, total: number, emphasis = false) => (
    <li key={label} className={emphasis ? "flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 font-semibold" : "flex items-center justify-between gap-3 px-3 py-2"}>
      <span className="text-sm">
        {label} <span className="text-xs font-normal text-muted-foreground">· {plural(count)}</span>
      </span>
      <span className="text-sm tabular-nums">{currencyFormatter(total)}</span>
    </li>
  );
  const online = line("Tienda en línea");
  const pointOfSale = line("Punto de venta");
  const fair = line("Feria");
  const marketplace = line("Mercado Libre");

  return (
    <SectionCard id="tributarios-canales" title="Ventas por canal" description="Las ventas presenciales se separan entre punto de venta y ferias; su suma sigue aparte.">
      <ul className="divide-y rounded-lg border" aria-label="Ventas por canal">
        {online && row(LINE_LABELS[online.channel], online.count, online.total)}
        {pointOfSale && row(LINE_LABELS[pointOfSale.channel], pointOfSale.count, pointOfSale.total)}
        {fair && row(LINE_LABELS[fair.channel], fair.count, fair.total)}
        {row("Total presencial (punto de venta + ferias)", channels.inPerson.count, channels.inPerson.total, true)}
        {marketplace && row(LINE_LABELS[marketplace.channel], marketplace.count, marketplace.total)}
      </ul>
    </SectionCard>
  );
}
