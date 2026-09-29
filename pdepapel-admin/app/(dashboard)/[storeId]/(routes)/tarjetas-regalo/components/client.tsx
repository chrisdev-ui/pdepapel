"use client";

import { ExternalLink } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Models } from "@/constants";
import { currencyFormatter } from "@/lib/utils";

import type { GiftCardDenominationRow, GiftCardRow } from "../server/get-gift-cards";
import { buildColumns } from "./columns";
import { DenominationsPanel } from "./denominations-panel";
import { GiftCardMobileCard } from "./gift-card-mobile-card";

interface GiftCardsClientProps {
  cards: GiftCardRow[];
  denominations: GiftCardDenominationRow[];
  canWrite: boolean;
}

export default function GiftCardsClient({ cards, denominations, canWrite }: GiftCardsClientProps) {
  const router = useRouter();
  const params = useParams();
  const storeId = String(params.storeId);
  const columns = useMemo(() => buildColumns(storeId), [storeId]);
  const outstanding = cards.reduce((sum, card) => sum + (card.status === "ACTIVE" ? Number(card.balance) : 0), 0);
  const active = cards.filter((card) => card.status === "ACTIVE" && Number(card.balance) > 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Tarjetas de regalo</h1>
          <p className="text-sm text-muted-foreground">
            Vendidas en la tienda en línea y usadas al pagar. {cards.length} en total
            {cards.length > 0 ? ` · ${active} con saldo · ${currencyFormatter(outstanding)} por redimir.` : "."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <Button asChild variant="outline">
            <a href="https://papeleriapdepapel.com/tarjeta-regalo" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              Ver en la tienda
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:items-start">
        <DataTable
          tableKey={Models.GiftCards}
          searchPlaceholder="Buscar por terminación, pedido, cliente o correo…"
          columns={columns}
          data={cards}
          selectable={false}
          getRowId={(row) => row.id}
          onRowClick={(row) => router.push(`/${storeId}/tarjetas-regalo/${row.id}`)}
          renderMobileCard={(row) => <GiftCardMobileCard card={row.original} storeId={storeId} />}
          emptyState={{
            title: "Aún no se ha vendido ninguna tarjeta",
            description: "Cuando una clienta compre una en la tienda y el pago se confirme, aparece aquí con su saldo.",
          }}
        />
        <DenominationsPanel storeId={storeId} rows={denominations} canWrite={canWrite} />
      </div>
    </div>
  );
}
