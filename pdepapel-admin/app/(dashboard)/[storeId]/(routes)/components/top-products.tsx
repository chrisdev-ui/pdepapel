import type { TodaySummary } from "@/lib/dashboard-today";
import { cn } from "@/lib/utils";
import Link from "next/link";

const RANK_TINT = ["bg-tint-pink", "bg-tint-lavender", "bg-tint-sky"];

export function TopProducts({ storeId, items }: { storeId: string; items: TodaySummary["topProducts"] }) {
  return (
    <section aria-labelledby="mas-vendidos" className="flex flex-col gap-2.5 rounded-xl border bg-white p-4 shadow-sm">
      <h2 id="mas-vendidos" className="text-[15px] font-bold text-primary">Más vendidos · 7 días</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay ventas pagadas esta semana.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-[13px]">
          {items.map((item, index) => (
            <li key={item.productId ?? item.name} className="flex items-center gap-2.5">
              <span className={cn("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-primary", RANK_TINT[index] ?? "bg-muted")}>{index + 1}</span>
              {item.productId ? (
                <Link href={`/${storeId}/productos/${item.productId}`} className="flex-1 truncate hover:underline">{item.name}</Link>
              ) : (
                <span className="flex-1 truncate">{item.name}</span>
              )}
              <span className="font-semibold text-muted-foreground">{item.units} und</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
