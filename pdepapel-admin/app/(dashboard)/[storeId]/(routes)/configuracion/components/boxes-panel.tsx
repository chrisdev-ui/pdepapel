"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Models } from "@/constants";

import { columns, type BoxColumn } from "../../cajas/components/columns";

/** Cajas y empaques dentro de Ajustes › Envíos y empaques. */
export function BoxesPanel({ data }: { data: BoxColumn[] }) {
  const params = useParams();
  const router = useRouter();
  const storeId = String(params.storeId);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-primary">Cajas y empaques</h2>
          <p className="text-sm text-muted-foreground">Medidas y pesos que usa el cotizador de envíos para elegir la caja. {data.length} en total.</p>
        </div>
        <Button asChild>
          <Link href={`/${storeId}/cajas/new`}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nueva caja
          </Link>
        </Button>
      </div>
      <DataTable
        tableKey={Models.Boxes}
        searchPlaceholder="Buscar caja…"
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/${storeId}/cajas/${row.id}`)}
        emptyState={{ title: "Aún no hay cajas", description: "Sin cajas, el cotizador usa las medidas por defecto de la tienda.", action: <Button asChild><Link href={`/${storeId}/cajas/new`}>Nueva caja</Link></Button> }}
      />
    </section>
  );
}
