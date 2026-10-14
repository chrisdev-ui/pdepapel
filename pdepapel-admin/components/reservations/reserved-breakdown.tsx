import Link from "next/link";

/** En bodega, reservados y lo que se puede vender; nada si no hay reservas. */
export function ReservedBreakdown({ storeId, stock, reserved }: { storeId: string; stock: number; reserved: number | null | undefined }) {
  if (!reserved || reserved <= 0) return null;
  const sellable = Math.max(0, stock - reserved);
  return (
    <dl className="mt-2 grid grid-cols-3 gap-2 rounded-md border px-3 py-2 text-xs" data-testid="reserved-breakdown">
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-muted-foreground">En bodega</dt>
        <dd className="text-sm font-semibold tabular-nums">{stock}</dd>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-muted-foreground">Reservados</dt>
        <dd className="text-sm font-semibold tabular-nums">
          <Link href={`/${storeId}/reservas`} className="underline-offset-2 hover:underline">
            {reserved}
          </Link>
        </dd>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-muted-foreground">Se pueden vender</dt>
        <dd className="text-sm font-semibold tabular-nums">{sellable}</dd>
      </div>
    </dl>
  );
}
