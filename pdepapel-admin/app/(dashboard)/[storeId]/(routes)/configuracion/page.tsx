import { auth } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import prismadb from "@/lib/prismadb";
import { cn } from "@/lib/utils";

import { getBoxes } from "../cajas/server/get-boxes";
import { CacheManagement } from "../envios/components/cache-management";
import { BoxesPanel } from "./components/boxes-panel";
import { IntegrationsPanel } from "./components/integrations-panel";
import { PaymentsPanel } from "./components/payments-panel";
import { SettingsForm } from "./components/settings-form";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Ajustes | PdePapel Admin",
  description: "Tienda, envíos y empaques, pagos, integraciones y herramientas avanzadas",
};

const TABS = [
  { id: "tienda", label: "Tienda" },
  { id: "envios", label: "Envíos y empaques" },
  { id: "pagos", label: "Pagos" },
  { id: "integraciones", label: "Integraciones" },
  { id: "avanzado", label: "Avanzado" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface SettingsPageProps {
  params: { storeId: string };
  searchParams: { tab?: string };
}

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const { userId } = auth();
  if (!userId) redirect("/iniciar-sesion");
  const store = await prismadb.store.findFirst({ where: { id: params.storeId, userId } });
  if (!store) redirect("/");

  const tab: Tab = TABS.some((item) => item.id === searchParams.tab) ? (searchParams.tab as Tab) : "tienda";
  const hrefFor = (id: Tab) => `/${params.storeId}/configuracion${id === "tienda" ? "" : `?tab=${id}`}`;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Ajustes</h1>
        <p className="text-sm text-muted-foreground">
          Datos de la tienda, envíos y empaques, cómo se cobra, qué servicios están conectados y las herramientas que rara vez se tocan.
        </p>
      </div>
      <nav role="tablist" aria-label="Secciones de ajustes" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
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

      {tab === "tienda" && <SettingsForm initialData={store} section="tienda" />}

      {tab === "envios" && (
        <div className="flex flex-col gap-8">
          <SettingsForm initialData={store} section="envios" />
          <BoxesPanel
            data={(await getBoxes(params.storeId)).map((box) => ({ ...box, dimensions: `${box.width} x ${box.height} x ${box.length}` }))}
          />
        </div>
      )}

      {tab === "pagos" && <PaymentsPanel storeId={params.storeId} />}

      {tab === "integraciones" && <IntegrationsPanel storeId={params.storeId} />}

      {tab === "avanzado" && (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Herramientas para quien desarrolla o mantiene la tienda. No hacen falta en el día a día.
          </p>
          <SettingsForm initialData={store} section="avanzado" />
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-1 text-base font-semibold text-primary">Caché de cotizaciones de EnvioClick</h2>
            <p className="mb-4 text-sm text-muted-foreground">Cotizaciones guardadas para no repetir llamadas. Limpiarla es seguro; solo vuelve a cotizar.</p>
            <CacheManagement />
          </section>
        </div>
      )}
    </div>
  );
}
