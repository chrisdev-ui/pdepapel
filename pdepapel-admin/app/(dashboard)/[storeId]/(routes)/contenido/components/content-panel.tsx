"use client";

import { Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Models } from "@/constants";
import { HOME_CONTENT_STATUS_LABELS, getHomeContentStatus } from "@/lib/home-content";

import type { HomeContentRow } from "../../portada/server/get-home-contents";
import { CellAction as PostCellAction } from "../../publicaciones/components/cell-action";
import { columns as postColumns, type PostColumn } from "../../publicaciones/components/columns";
import { HomeContentCellAction, HomeContentStatusBadge, homeContentColumns, homeContentKind } from "./home-content-columns";

type ContentPanelProps =
  | { kind: "portada"; entries: HomeContentRow[] }
  | { kind: "redes"; posts: PostColumn[] };

function HomeContentCard({ row }: { row: HomeContentRow }) {
  return (
    <article className="flex gap-3 rounded-xl border bg-white p-3 shadow-sm">
      <span className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md border bg-muted">
        {row.imageUrl && <Image src={row.imageUrl} alt="" fill className="object-cover" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-semibold">{row.title}</span>
        <span className="truncate text-xs text-muted-foreground">{homeContentKind(row)}</span>
        <HomeContentStatusBadge row={row} />
      </div>
      <HomeContentCellAction data={row} />
    </article>
  );
}

export function ContentPanel(props: ContentPanelProps) {
  const params = useParams();
  const router = useRouter();
  const storeId = String(params.storeId);

  if (props.kind === "portada") {
    const live = props.entries.filter((entry) => getHomeContentStatus(entry) === "en-vivo");
    const liveHero = live.find((entry) => entry.placement === "HERO");
    const liveCampaign = live.find((entry) => entry.placement === "CAMPAIGN");
    const newHref = `/${storeId}/portada/nuevo`;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {liveHero ? `Hero en vivo: «${liveHero.title}».` : "Sin hero en vivo: la tienda usa el texto por defecto."}{" "}
            {liveCampaign ? `Banner de campaña en vivo: «${liveCampaign.title}».` : "Sin banner de campaña: la sección no se muestra."}
          </p>
          <div className="flex items-center gap-2">
            <RefreshButton />
            <Button asChild>
              <Link href={newHref}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Nueva entrada
              </Link>
            </Button>
          </div>
        </div>
        <DataTable
          tableKey={Models.HomeContent}
          searchPlaceholder="Buscar por título…"
          columns={homeContentColumns}
          data={props.entries}
          getRowId={(row) => row.id}
          filters={[
            {
              columnKey: "status",
              title: "Estado",
              options: Object.entries(HOME_CONTENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
            },
          ]}
          onRowClick={(row) => router.push(`/${storeId}/portada/${row.id}`)}
          renderMobileCard={(row) => <HomeContentCard row={row.original} />}
          emptyState={{
            title: "Aún no hay contenido de portada",
            description: "Crea el hero (primer pantallazo) y, cuando haya algo que contar, un banner de campaña con fechas.",
            action: (
              <Button asChild>
                <Link href={newHref}>Nueva entrada</Link>
              </Button>
            ),
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Publicaciones de Instagram, TikTok o Facebook que se muestran en la tienda. Pega el identificador de la publicación. {props.posts.length} en total.
        </p>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <Button asChild>
            <Link href={`/${storeId}/publicaciones/new`}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nueva publicación
            </Link>
          </Button>
        </div>
      </div>
      <DataTable
        tableKey={Models.Posts}
        searchPlaceholder="Buscar red o identificador…"
        columns={postColumns}
        data={props.posts}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/${storeId}/publicaciones/${row.id}`)}
        renderMobileCard={(row) => (
          <article className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold">{row.original.social}</span>
              <code className="truncate text-xs text-muted-foreground">{row.original.postId}</code>
            </div>
            <PostCellAction data={row.original} />
          </article>
        )}
        emptyState={{ title: "Aún no hay publicaciones", description: "Muestra en la tienda lo que publicas en redes.", action: <Button asChild><Link href={`/${storeId}/publicaciones/new`}>Nueva publicación</Link></Button> }}
      />
    </div>
  );
}
