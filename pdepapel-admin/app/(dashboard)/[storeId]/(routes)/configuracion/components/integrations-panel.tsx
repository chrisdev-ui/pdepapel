import { MarketplaceProvider } from "@prisma/client";
import { Activity, BarChart3, Images, Mail, Sparkles, Store, Truck } from "lucide-react";

import { getMercadoLibreConfigurationStatus } from "@/lib/mercadolibre/config";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";

import { GoogleMerchantFeedCard } from "./google-merchant-feed-card";
import { CONFIGURED, MISSING, OPTIONAL_OFF, StatusCard, type StatusTone } from "./status-cards";

const CONNECTION: Record<string, { label: string; tone: StatusTone }> = {
  CONNECTED: { label: "Conectada", tone: "mint" },
  PENDING: { label: "Pendiente", tone: "cream" },
  REAUTH_REQUIRED: { label: "Requiere reconexión", tone: "pink" },
  DISCONNECTED: { label: "Desconectada", tone: "slate" },
  ERROR: { label: "Con error", tone: "pink" },
};

const DATE_TIME = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

/**
 * Pestaña Integraciones: estado de cada servicio externo y a dónde ir para
 * actuar. Solo dice si la configuración existe; las claves nunca se muestran.
 */
export async function IntegrationsPanel({ storeId }: { storeId: string }) {
  const connection = await prismadb.marketplaceConnection.findUnique({
    where: { storeId_provider: { storeId, provider: MarketplaceProvider.MERCADOLIBRE } },
    select: { status: true, sellerId: true, lastSyncedAt: true, recoveryScheduleId: true },
  });
  const mlConfig = getMercadoLibreConfigurationStatus();
  const mlQueue = getMercadoLibreQueueConfigurationStatus();
  const envioclick = Boolean(process.env.ENVIOCLICK_API_KEY);
  const ga4 = Boolean(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET);
  const resend = Boolean(process.env.RESEND_API_KEY);
  const gemini = Boolean(process.env.GEMINI_API_KEY);
  const cloudinary = Boolean(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
  const cron = Boolean(process.env.CRON_SECRET);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Servicios externos que usa la tienda. Las claves viven en Vercel y se cambian allí; desde aquí solo se ve el estado y se llega a cada acción.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <StatusCard
          icon={Store}
          title="Mercado Libre"
          description="Cuenta vendedora autorizada y procesamiento seguro de ventas por QStash."
          status={!mlConfig.configured ? MISSING : connection ? CONNECTION[connection.status] : { label: "Sin conectar", tone: "slate" }}
          facts={[
            { label: "Vendedor", value: connection?.sellerId ?? "—" },
            { label: "Última actividad", value: connection?.lastSyncedAt ? DATE_TIME.format(new Date(connection.lastSyncedAt)) : "—" },
            { label: "Procesamiento seguro", value: !mlQueue.configured ? "Faltan variables" : connection?.recoveryScheduleId ? "Activo" : "Por activar" },
          ]}
          action={{ label: "Conectar o reconectar en Mercado Libre › Resumen", href: `/${storeId}/mercadolibre` }}
        />
        <StatusCard
          icon={Truck}
          title="EnvioClick"
          description="Cotiza guías y crea etiquetas de transportadoras desde cada pedido."
          status={envioclick ? CONFIGURED : MISSING}
          action={{ label: "Ver envíos", href: `/${storeId}/envios` }}
        />
        <StatusCard
          icon={BarChart3}
          title="Google Analytics 4"
          description="Eventos de compra desde el servidor. Las variables son solo de producción: si faltan allí, la analítica queda a oscuras."
          status={ga4 ? CONFIGURED : process.env.VERCEL_ENV === "production" ? MISSING : OPTIONAL_OFF}
        />
        <StatusCard
          icon={Mail}
          title="Resend · correos"
          description="Confirmaciones de pedido, boletín y avisos al equipo."
          status={resend ? CONFIGURED : MISSING}
          action={{ label: "Ver boletín", href: `/${storeId}/boletin` }}
        />
        <StatusCard
          icon={Images}
          title="Cloudinary · imágenes"
          description="Almacena las fotos de productos, portada y banners."
          status={cloudinary ? CONFIGURED : MISSING}
          action={{ label: "Limpiar imágenes sin uso", href: `/${storeId}/configuracion/cloudinary` }}
        />
        <StatusCard
          icon={Sparkles}
          title="Gemini · ayuda de catálogo"
          description="Sugiere nombres y describe fotos de productos. Opcional: sin clave, el catálogo se edita a mano."
          status={gemini ? CONFIGURED : OPTIONAL_OFF}
        />
        <StatusCard
          icon={Activity}
          title="Tareas programadas"
          description="Vigencias de cupones y ofertas cada día (Vercel) y salud de Mercado Libre y feed de Merchant (GitHub Actions)."
          status={cron ? CONFIGURED : MISSING}
          facts={[{ label: "Cupones y ofertas", value: "Diario 00:00" }, { label: "Salud ML y feed", value: "Diario por GitHub" }]}
        />
      </div>
      <GoogleMerchantFeedCard storeId={storeId} />
    </div>
  );
}
