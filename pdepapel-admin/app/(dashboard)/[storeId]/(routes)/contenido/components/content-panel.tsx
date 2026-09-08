"use client";

import { Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Models } from "@/constants";

import { CellAction as BannerCellAction } from "../../banners/components/cell-action";
import { bannerColumns, mainBannerColumns, type BannerColumn, type MainBannerColumn } from "../../banners/components/columns";
import { CellAction as BillboardCellAction } from "../../diapositivas/components/cell-action";
import { columns as billboardColumns, type BillboardColumn } from "../../diapositivas/components/columns";
import { relativeDate } from "../../pedidos/components/columns";
import { CellAction as PostCellAction } from "../../publicaciones/components/cell-action";
import { columns as postColumns, type PostColumn } from "../../publicaciones/components/columns";

type ContentPanelProps =
  | { kind: "portada"; billboards: BillboardColumn[] }
  | { kind: "banners"; mainBanner: MainBannerColumn[]; banners: BannerColumn[] }
  | { kind: "redes"; posts: PostColumn[] };

function ImageCard({ src, title, subtitle, action }: { src: string; title: string; subtitle: string; action: React.ReactNode }) {
  return (
    <article className="flex gap-3 rounded-xl border bg-white p-3 shadow-sm">
      <span className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md border bg-muted">
        <Image src={src} alt="" fill className="object-cover" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </div>
      {action}
    </article>
  );
}

export function ContentPanel(props: ContentPanelProps) {
  const params = useParams();
  const router = useRouter();
  const storeId = String(params.storeId);

  if (props.kind === "portada") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Las diapositivas rotan en la portada de la tienda. Usa imágenes horizontales y un enlace claro. {props.billboards.length} en total.
          </p>
          <div className="flex items-center gap-2">
            <RefreshButton />
            <Button asChild>
              <Link href={`/${storeId}/diapositivas/new`}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Nueva diapositiva
              </Link>
            </Button>
          </div>
        </div>
        <DataTable
          tableKey={Models.Billboards}
          searchPlaceholder="Buscar por descripción o título…"
          columns={billboardColumns}
          data={props.billboards}
          getRowId={(row) => row.id}
          onRowClick={(row) => router.push(`/${storeId}/diapositivas/${row.id}`)}
          renderMobileCard={(row) => (
            <ImageCard src={row.original.imageUrl} title={row.original.title ?? row.original.label} subtitle={relativeDate(row.original.createdAt)} action={<BillboardCellAction data={row.original} />} />
          )}
          emptyState={{ title: "Aún no hay diapositivas", description: "La portada muestra un fondo neutro hasta que agregues la primera.", action: <Button asChild><Link href={`/${storeId}/diapositivas/new`}>Nueva diapositiva</Link></Button> }}
        />
      </div>
    );
  }

  if (props.kind === "banners") {
    return (
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-primary">Banner principal</h2>
              <p className="text-sm text-muted-foreground">El bloque grande con título y dos párrafos. Solo puede existir uno.</p>
            </div>
            {props.mainBanner.length === 0 && (
              <Button asChild>
                <Link href={`/${storeId}/banners/principal/new`}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Crear banner principal
                </Link>
              </Button>
            )}
          </div>
          <DataTable
            tableKey={Models.MainBanner}
            columns={mainBannerColumns}
            data={props.mainBanner}
            getRowId={(row) => row.id}
            onRowClick={(row) => router.push(`/${storeId}/banners/principal/${row.id}`)}
            renderMobileCard={(row) => (
              <ImageCard src={row.original.imageUrl} title={row.original.title ?? "Banner principal"} subtitle={row.original.callToAction ?? "Sin enlace"} action={<BannerCellAction source={Models.MainBanner} data={row.original} />} />
            )}
            emptyState={{ title: "Sin banner principal", description: "La tienda no muestra el bloque destacado hasta que lo crees." }}
          />
        </section>
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-primary">Banners con enlace</h2>
              <p className="text-sm text-muted-foreground">Imágenes con llamado a la acción repartidas por la tienda. {props.banners.length} en total.</p>
            </div>
            <div className="flex items-center gap-2">
              <RefreshButton />
              <Button asChild>
                <Link href={`/${storeId}/banners/new`}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Nuevo banner
                </Link>
              </Button>
            </div>
          </div>
          <DataTable
            tableKey={Models.Banners}
            searchPlaceholder="Buscar por enlace…"
            columns={bannerColumns}
            data={props.banners}
            getRowId={(row) => row.id}
            onRowClick={(row) => router.push(`/${storeId}/banners/${row.id}`)}
            renderMobileCard={(row) => (
              <ImageCard src={row.original.imageUrl} title={row.original.callToAction} subtitle={relativeDate(row.original.createdAt)} action={<BannerCellAction source={Models.Banners} data={row.original} />} />
            )}
            emptyState={{ title: "Aún no hay banners", description: "Un banner lleva a una colección, una oferta o una página.", action: <Button asChild><Link href={`/${storeId}/banners/new`}>Nuevo banner</Link></Button> }}
          />
        </section>
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
