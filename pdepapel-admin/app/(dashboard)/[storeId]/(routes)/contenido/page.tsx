import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { getHomeContents } from "../portada/server/get-home-contents";
import { getPosts } from "../publicaciones/server/get-posts";
import { ContentPanel } from "./components/content-panel";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Contenido de la tienda | PdePapel Admin",
  description: "Portada (hero y banner de campaña) y publicaciones de redes que se ven en la tienda",
};

const TABS = [
  { id: "portada", label: "Portada" },
  { id: "redes", label: "Redes en la tienda" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface ContentPageProps {
  params: { storeId: string };
  searchParams: { tab?: string };
}

export default async function ContentPage({ params, searchParams }: ContentPageProps) {
  const tab: Tab = searchParams.tab === "redes" ? "redes" : "portada";
  const hrefFor = (id: Tab) => `/${params.storeId}/contenido${id === "portada" ? "" : `?tab=${id}`}`;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Contenido de la tienda</h1>
        <p className="text-sm text-muted-foreground">
          Lo que la gente ve al entrar: el hero de la portada, el banner de campaña cuando hay algo que contar y las publicaciones de redes. Los cambios se reflejan en la tienda al guardar.
        </p>
      </div>
      <nav role="tablist" aria-label="Secciones de contenido" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
        {TABS.map((item) => (
          <Link
            key={item.id}
            role="tab"
            aria-selected={item.id === tab}
            href={hrefFor(item.id)}
            className={cn(
              "flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition-colors",
              item.id === tab ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "portada" ? (
        <ContentPanel kind="portada" entries={await getHomeContents(params.storeId)} />
      ) : (
        <ContentPanel kind="redes" posts={await getPosts(params.storeId)} />
      )}
    </div>
  );
}
