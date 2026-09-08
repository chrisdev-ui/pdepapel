import Image from "next/image";

import { DataTableCellRating } from "@/components/ui/data-table-cell-rating";

import { relativeDate } from "../../pedidos/components/columns";
import { CellAction } from "./cell-action";
import { ReviewStatusBadge, type ReviewsColumn } from "./columns";

export function ReviewMobileCard({ review }: { review: ReviewsColumn }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border bg-white p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
          <Image src={review.productImage} alt="" fill className="object-cover" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-primary">{review.productName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {review.name} · {relativeDate(review.createdAt)}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <DataTableCellRating value={review.rating} />
            <ReviewStatusBadge review={review} />
          </div>
        </div>
        <CellAction data={review} />
      </div>
      {review.comment && <p className="text-sm">{review.comment}</p>}
      {review.reply && (
        <p className="rounded-md bg-tint-mint/60 px-2 py-1 text-xs text-primary">
          <span className="font-semibold">Respuesta: </span>
          {review.reply}
        </p>
      )}
    </article>
  );
}
