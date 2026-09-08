import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SEGMENT_LABELS } from "@/lib/customer-views";
import { currencyFormatter } from "@/lib/utils";

import { TintBadge } from "../../pedidos/components/order-badges";
import { relativeDate } from "../../pedidos/components/columns";
import { CellAction } from "./cell-action";
import { formatPhone, type CustomerColumn } from "./columns";

export function CustomerMobileCard({ customer, storeId }: { customer: CustomerColumn; storeId: string }) {
  const badge = SEGMENT_LABELS[customer.segment];
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={`/${storeId}/clientes/${customer.id}`} className="truncate text-sm font-bold text-primary">
            {customer.fullName}
          </Link>
          <span className="truncate text-xs text-muted-foreground">
            {formatPhone(customer.phone)}
            {customer.city ? ` · ${customer.city}` : ""}
          </span>
        </div>
        <TintBadge label={badge.label} tone={badge.tone} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {customer.paidOrders} compra{customer.paidOrders === 1 ? "" : "s"} · {currencyFormatter(customer.totalSpent)}
        </span>
        <span className="ml-auto">{customer.lastPaidAt ? `Última ${relativeDate(customer.lastPaidAt)}` : "Sin compras"}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="soft" className="flex-1">
          <Link href={`/${storeId}/clientes/${customer.id}`}>Ver cliente</Link>
        </Button>
        <CellAction data={customer} />
      </div>
    </article>
  );
}
