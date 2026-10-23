"use client";

import type { SocialPlatform } from "@prisma/client";
import axios from "axios";
import {
  Eye,
  ImageOff,
  Loader2,
  RefreshCw,
  Sparkles,
  Users,
  type LucideProps,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { SocialNetworkIcons } from "@/components/ui/social-network-icons";
import { TabNav } from "@/components/ui/tab-nav";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { getSocialDashboard } from "@/lib/social/access";
import type {
  SocialAccountSummary,
  SocialPostSummary,
} from "@/lib/social/report";

import { FollowersTrend } from "./followers-trend";
import { PostCurveDialog } from "./post-curve-dialog";
import { WhatWorksCard } from "./what-works-card";
import { RETENTION_WARNING_TEXT, RetentionFlag } from "./retention-flag";
import {
  formatPct,
  multiplierText,
  retentionDetails,
  visibleColumns,
  type PlatformFilter,
} from "@/lib/social/display";

type Dashboard = Awaited<ReturnType<typeof getSocialDashboard>>;

const NUMBER = new Intl.NumberFormat("es-CO");
const DATE = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeZone: "America/Bogota",
});
const DATE_TIME = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});
const num = (value: number | null) =>
  value == null ? "—" : NUMBER.format(value);

const PLATFORM: Record<
  SocialPlatform,
  { label: string; icon: (props: LucideProps) => JSX.Element; tint: string }
> = {
  INSTAGRAM: {
    label: "Instagram",
    icon: SocialNetworkIcons.instagram,
    tint: "bg-tint-pink",
  },
  TIKTOK: {
    label: "TikTok",
    icon: SocialNetworkIcons.tiktok,
    tint: "bg-tint-sky",
  },
};

const TYPE_LABEL: Record<string, string> = {
  REELS: "Reel",
  FEED: "Publicación",
  CAROUSEL: "Carrusel",
  STORY: "Historia",
  VIDEO: "Video",
};

const TIKTOK_REASON: Record<string, string> = {
  denied: "Cancelaste la autorización en TikTok.",
  invalid_state:
    "El enlace de conexión venció o ya se usó. Vuelve a intentarlo.",
  not_owner: "Solo la dueña que empezó la conexión puede terminarla.",
  configuration: "TikTok no está configurado en el servidor.",
  authorization:
    "TikTok no aceptó la conexión. Vuelve a intentarlo en unos minutos.",
};

/** Miniatura efímera (Meta y TikTok la vencen): si no carga, un marcador neutro; nunca se copia a otro servidor. */
function Thumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        aria-hidden
      >
        <ImageOff className="h-5 w-5" />
      </span>
    );
  }
  return (
    // Dirección externa que vence en horas: no pasa por el cargador de Cloudinary.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-lg object-cover"
    />
  );
}

function AccountCard({
  storeId,
  platform,
  account,
  configured,
  onConnectInstagram,
  connecting,
}: {
  storeId: string;
  platform: SocialPlatform;
  account: SocialAccountSummary | undefined;
  configured: boolean;
  onConnectInstagram: () => void;
  connecting: boolean;
}) {
  const meta = PLATFORM[platform];
  const Icon = meta.icon;
  const needsReconnect = account?.status === "NEEDS_RECONNECT";
  const connect =
    platform === "INSTAGRAM" ? (
      <Button
        size="sm"
        variant={account ? "outline" : "default"}
        onClick={onConnectInstagram}
        disabled={!configured || connecting}
        className="min-h-[44px]"
      >
        {connecting && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        )}
        {account ? "Volver a conectar" : "Conectar Instagram"}
      </Button>
    ) : configured ? (
      <Button
        size="sm"
        variant={account && !needsReconnect ? "outline" : "default"}
        asChild
        className="min-h-[44px]"
      >
        <a href={`/api/${storeId}/social/tiktok/connect`}>
          {account ? "Volver a conectar" : "Conectar TikTok"}
        </a>
      </Button>
    ) : (
      <Button size="sm" disabled className="min-h-[44px]">
        Conectar TikTok
      </Button>
    );

  return (
    <section
      aria-labelledby={`cuenta-${platform}`}
      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-primary ${meta.tint}`}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2
              id={`cuenta-${platform}`}
              className="text-base font-semibold text-primary"
            >
              {meta.label}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {account?.username
                ? `@${account.username}`
                : account
                  ? "Cuenta conectada"
                  : "Sin conectar"}
            </p>
          </div>
        </div>
        {!configured ? (
          <TintBadge label="No configurada" tone="slate" />
        ) : needsReconnect ? (
          <TintBadge label="Reconectar" tone="pink" />
        ) : account ? (
          <TintBadge label="Conectada" tone="mint" />
        ) : null}
      </div>
      {account && (
        <>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Seguidores</dt>
              <dd className="font-semibold text-primary">
                {num(account.followers)}
                {account.followersDelta != null &&
                  account.followersDelta !== 0 && (
                    <span className="ml-1 text-xs font-medium text-muted-foreground">
                      ({account.followersDelta > 0 ? "+" : ""}
                      {NUMBER.format(account.followersDelta)})
                    </span>
                  )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Última lectura</dt>
              <dd className="font-medium text-primary">
                {account.lastSyncAt
                  ? DATE_TIME.format(new Date(account.lastSyncAt))
                  : "Todavía no"}
              </dd>
            </div>
          </dl>
          <FollowersTrend daily={account.followersDaily} />
        </>
      )}
      {needsReconnect && (
        <p className="text-sm text-primary">
          La red rechazó el acceso guardado. Vuelve a conectar la cuenta para
          seguir leyendo las métricas.
        </p>
      )}
      {!configured && (
        <p className="text-sm text-muted-foreground">
          Falta configurar las claves de {meta.label} en el servidor.
        </p>
      )}
      <div className="flex flex-wrap gap-2">{connect}</div>
    </section>
  );
}

export function SocialMetricsClient({
  storeId,
  data,
  periods,
  tiktokResult,
  tiktokReason,
}: {
  storeId: string;
  data: Dashboard;
  periods: number[];
  tiktokResult: string | null;
  tiktokReason: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [selected, setSelected] = useState<SocialPostSummary | null>(null);

  const accountOf = (platform: SocialPlatform) =>
    data.accounts.find((account) => account.platform === platform);
  const posts = data.posts.filter(
    (post) => platformFilter === "ALL" || post.platform === platformFilter,
  );
  const totalViews = posts.reduce((sum, post) => sum + (post.views ?? 0), 0);
  const rates = posts
    .map((post) => post.engagementRate)
    .filter((rate): rate is number => rate != null);
  const avgRate = rates.length
    ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10
    : null;
  const best = [...posts].sort(
    (a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0),
  )[0];

  const connectInstagram = async () => {
    setConnecting(true);
    try {
      await axios.post(`/api/${storeId}/social/instagram/connect`);
      toast({
        title: "Instagram conectado",
        description: "La primera lectura llega con la próxima sincronización.",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo conectar Instagram",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data: result } = await axios.post<{ enqueued: number }>(
        `/api/${storeId}/social/sync`,
      );
      toast({
        title: result.enqueued
          ? "Sincronización en camino"
          : "No hay cuentas para leer",
        description: result.enqueued
          ? "Las cifras se actualizan en unos minutos; vuelve a cargar la página."
          : "Conecta una cuenta primero.",
      });
    } catch (error) {
      toast({
        title: "No se pudo sincronizar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            Métricas de redes
          </h1>
          <p className="text-sm text-muted-foreground">
            Cómo les fue a las publicaciones de Instagram y TikTok. Se leen cada
            6 horas, y lo publicado en las últimas 8 horas, cada hora.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={syncNow}
          disabled={
            syncing || !data.queueConfigured || data.accounts.length === 0
          }
          className="min-h-[44px]"
        >
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
          )}
          Sincronizar ahora
        </Button>
      </div>

      {tiktokResult === "conectado" && (
        <p
          role="status"
          className="rounded-lg bg-tint-mint p-3 text-sm font-medium text-primary"
        >
          TikTok quedó conectado. La primera lectura llega con la próxima
          sincronización.
        </p>
      )}
      {tiktokResult === "error" && (
        <p
          role="alert"
          className="rounded-lg bg-tint-pink p-3 text-sm font-medium text-primary"
        >
          {TIKTOK_REASON[tiktokReason ?? ""] ?? "No se pudo conectar TikTok."}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {(["INSTAGRAM", "TIKTOK"] as const).map((platform) => (
          <AccountCard
            key={platform}
            storeId={storeId}
            platform={platform}
            account={accountOf(platform)}
            configured={data.platforms[platform].configured}
            onConnectInstagram={connectInstagram}
            connecting={connecting}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabNav
          label="Periodo"
          activeId={String(data.days)}
          items={periods.map((days) => ({
            id: String(days),
            label: `${days} días`,
            href: `?dias=${days}`,
          }))}
        />
        <div
          role="group"
          aria-label="Red"
          className="flex flex-wrap gap-1 rounded-2xl border bg-white p-1 sm:rounded-full"
        >
          {(["ALL", "INSTAGRAM", "TIKTOK"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={platformFilter === value}
              onClick={() => setPlatformFilter(value)}
              className={`min-h-[44px] rounded-full px-4 text-sm font-semibold ${platformFilter === value ? "bg-primary text-primary-foreground" : "text-primary hover:bg-muted"}`}
            >
              {value === "ALL" ? "Todas" : PLATFORM[value].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <MetricCard
          label="Publicaciones"
          value={NUMBER.format(posts.length)}
          note={`Últimos ${data.days} días`}
          icon={<Sparkles className="h-4 w-4" aria-hidden />}
          tint="bg-tint-lavender"
        />
        <MetricCard
          label="Vistas"
          value={NUMBER.format(totalViews)}
          note="Suma de la última lectura de cada una"
          icon={<Eye className="h-4 w-4" aria-hidden />}
          tint="bg-tint-sky"
        />
        <MetricCard
          label="Interacción promedio"
          value={avgRate == null ? "—" : `${avgRate} %`}
          note="Interacciones sobre alcance (o vistas en TikTok)"
          icon={<Users className="h-4 w-4" aria-hidden />}
          tint="bg-tint-mint"
        />
      </div>
      {best && best.multiplier != null && best.multiplier >= 2 && (
        <p className="text-sm text-primary">
          La que más destacó:{" "}
          <span className="font-semibold">
            {best.caption?.slice(0, 80) ??
              TYPE_LABEL[best.productType ?? ""] ??
              "una publicación"}
          </span>
          , {best.multiplier}× la mediana de {PLATFORM[best.platform].label}
          {best.multiplierApprox ? " (aprox.)" : ""}.
        </p>
      )}

      {data.whatWorks.some((network) => platformFilter === "ALL" || network.platform === platformFilter) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.whatWorks
            .filter((network) => platformFilter === "ALL" || network.platform === platformFilter)
            .map((network) => (
              <WhatWorksCard key={network.platform} network={network} />
            ))}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">
          {data.accounts.length === 0
            ? "Conecta Instagram o TikTok para empezar a ver cifras."
            : "Todavía no hay publicaciones leídas en este periodo."}
        </p>
      ) : (
        <>
          <ul
            className="flex flex-col gap-2 md:hidden"
            aria-label="Publicaciones"
          >
            {posts.map((post) => (
              <li key={post.id}>
                <button
                  type="button"
                  onClick={() => setSelected(post)}
                  className="flex w-full min-w-0 items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm"
                >
                  <Thumbnail src={post.thumbnailUrl} alt="" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-medium text-primary">
                      {post.caption ??
                        TYPE_LABEL[post.productType ?? ""] ??
                        "Publicación"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {PLATFORM[post.platform].label} ·{" "}
                      {DATE.format(new Date(post.postedAt))}
                    </span>
                    <span className="text-xs text-primary">
                      {num(post.views)} vistas
                      {post.multiplier != null
                        ? ` · ${multiplierText(post)}`
                        : ""}
                      {post.engagementRate != null
                        ? ` · ${post.engagementRate} %`
                        : ""}
                    </span>
                    {(post.watchedPct != null || post.skipRate != null) && (
                      <span className="text-xs text-muted-foreground">
                        {post.watchedPct != null
                          ? `${formatPct(post.watchedPct)} visto`
                          : ""}
                        {post.watchedPct != null && post.skipRate != null
                          ? " · "
                          : ""}
                        {post.skipRate != null
                          ? `salto ${formatPct(post.skipRate)}`
                          : ""}
                      </span>
                    )}
                    {post.retentionWarning && (
                      <span className="text-xs font-semibold text-destructive">
                        ⚠ {RETENTION_WARNING_TEXT}.{" "}
                        {retentionDetails(post).join(" ")}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Publicaciones del periodo; elige una para ver su curva.
              </caption>
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Publicación
                  </th>
                  {visibleColumns(platformFilter).map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 text-right font-semibold"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    className="border-b last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelected(post)}
                          className="flex min-h-[44px] min-w-0 items-center gap-3 text-left"
                        >
                          <Thumbnail src={post.thumbnailUrl} alt="" />
                          <span className="flex min-w-0 flex-col">
                            <span className="line-clamp-1 max-w-[22rem] font-medium text-primary">
                              {post.caption ??
                                TYPE_LABEL[post.productType ?? ""] ??
                                "Publicación"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {PLATFORM[post.platform].label} ·{" "}
                              {TYPE_LABEL[post.productType ?? ""] ?? "—"} ·{" "}
                              {DATE.format(new Date(post.postedAt))}
                            </span>
                          </span>
                        </button>
                        {post.retentionWarning && (
                          <RetentionFlag details={retentionDetails(post)} />
                        )}
                      </div>
                    </td>
                    {visibleColumns(platformFilter).map((column) => (
                      <td
                        key={column.key}
                        className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
                      >
                        {column.cell(post)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <PostCurveDialog
        storeId={storeId}
        tagOptions={data.tagOptions}
        post={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
