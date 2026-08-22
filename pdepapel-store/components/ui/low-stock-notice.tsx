import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

export const LOW_STOCK_THRESHOLD = 3;

type LowStockNoticeVariant = "card" | "detail";

interface LowStockNoticeProps {
  stock: number | null | undefined;
  variant: LowStockNoticeVariant;
  className?: string;
}

export function isLowStock(stock: number | null | undefined): stock is number {
  return typeof stock === "number" && stock > 0 && stock <= LOW_STOCK_THRESHOLD;
}

export function getLowStockLabel(
  stock: number,
  variant: LowStockNoticeVariant,
): string {
  if (variant === "card") {
    return stock === 1 ? "Última unidad" : `Últimas ${stock} unidades`;
  }

  return stock === 1
    ? "¡Última unidad disponible!"
    : `¡Solo quedan ${stock} unidades de esta opción!`;
}

export function canShowLowStockInProductCard(
  stock: number | null | undefined,
  isGroup: boolean | null | undefined,
): boolean {
  return !isGroup && isLowStock(stock);
}

export function LowStockNotice({
  stock,
  variant,
  className,
}: LowStockNoticeProps): JSX.Element | null {
  if (!isLowStock(stock)) return null;

  const label = getLowStockLabel(stock, variant);

  if (variant === "card") {
    return (
      <p
        className={cn(
          "flex items-center gap-1 font-quicksand text-[11px] font-semibold text-amber-700 sm:text-xs",
          className,
        )}
      >
        <Flame className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-quicksand text-sm font-semibold text-amber-900",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Flame className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      {label}
    </div>
  );
}
