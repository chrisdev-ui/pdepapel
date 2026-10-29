"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSWRConfig } from "swr";

import { PreorderPaymentDialog } from "@/components/orders/preorder-payment-dialog";
import { PreorderWaitlistPanel } from "@/components/presales/preorder-waitlist-panel";
import { Button } from "@/components/ui/button";
import type { WaitlistEntryRow } from "@/lib/preorder-waitlist-shared";

/** La lista de espera de la preventa, con «Marcar anticipo recibido» si la preventa es con anticipo. */
export function PresaleWaitlistBlock({
  storeId,
  productId,
  presaleId,
  unitDeposit,
}: {
  storeId: string;
  productId: string;
  presaleId: string;
  /** Anticipo de una unidad; null si la preventa se paga completa. */
  unitDeposit: number | null;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [entry, setEntry] = useState<WaitlistEntryRow | null>(null);

  return (
    <div className="space-y-2 border-t pt-3">
      <PreorderWaitlistPanel
        storeId={storeId}
        productId={productId}
        presaleId={presaleId}
        renderDepositAction={
          unitDeposit === null
            ? undefined
            : (row) => (
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setEntry(row)}>
                  Marcar anticipo recibido
                </Button>
              )
        }
      />
      {entry && unitDeposit !== null ? (
        <PreorderPaymentDialog
          storeId={storeId}
          open
          onOpenChange={(open) => !open && setEntry(null)}
          target={{ mode: "deposit", presaleId, source: { kind: "waitlist", entryId: entry.id } }}
          defaultAmount={unitDeposit}
          subjectLabel={entry.name ? entry.name : "esta persona"}
          customerEmail={entry.email}
          onDone={async () => {
            await mutate(`/api/${storeId}/preorder-waitlist?productId=${encodeURIComponent(productId)}`);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
