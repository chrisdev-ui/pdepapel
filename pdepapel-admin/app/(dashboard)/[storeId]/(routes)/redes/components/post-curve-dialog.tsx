"use client";

import axios from "axios";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CHART_COLORS } from "@/lib/chart-palette";
import type { SocialPostSummary } from "@/lib/social/report";

import { RETENTION_WARNING_TEXT } from "./retention-flag";
import { postMetricRows, retentionDetails } from "@/lib/social/display";

interface CurvePoint {
  hoursSincePost: number;
  views: number | null;
  likes: number | null;
}

const NUMBER = new Intl.NumberFormat("es-CO");
const hoursLabel = (hours: number) =>
  hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} d`;
/** La curva de vistas de una publicación desde que salió. */
export function PostCurveDialog({
  storeId,
  post,
  onClose,
}: {
  storeId: string;
  post: SocialPostSummary | null;
  onClose: () => void;
}) {
  const [curve, setCurve] = useState<CurvePoint[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!post) return;
    let active = true;
    setCurve(null);
    setFailed(false);
    axios
      .get<{ curve: CurvePoint[] }>(`/api/${storeId}/social/posts/${post.id}`)
      .then(({ data }) => active && setCurve(data.curve))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [storeId, post]);

  return (
    <Dialog open={post !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">
            {post?.caption ?? "Publicación"}
          </DialogTitle>
          <DialogDescription>
            Vistas desde que se publicó. Cada punto es una lectura.
          </DialogDescription>
        </DialogHeader>
        {post && (
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {[
              ["A las 3 h", post.views3h],
              ["A las 24 h", post.views24h],
              ["A los 7 días", post.views7d],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg bg-muted p-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-semibold text-primary">
                  {value == null ? "—" : NUMBER.format(value as number)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {post?.retentionWarning && (
          <div className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
            <p className="font-semibold">⚠ {RETENTION_WARNING_TEXT}</p>
            {retentionDetails(post).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        {post && (
          <dl
            aria-label="Métricas de la última lectura"
            className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3"
          >
            {postMetricRows(post).map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-2 border-b py-1"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums text-primary">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="h-64 w-full">
          {failed ? (
            <p className="text-sm text-muted-foreground">
              No se pudo cargar la curva.
            </p>
          ) : !curve ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Cargando" />
            </div>
          ) : curve.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Hace falta más de una lectura para dibujar la curva.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={curve}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  stroke={CHART_COLORS.grid}
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="hoursSincePost"
                  type="number"
                  tickFormatter={hoursLabel}
                  stroke={CHART_COLORS.axis}
                  fontSize={12}
                />
                <YAxis
                  stroke={CHART_COLORS.axis}
                  fontSize={12}
                  width={56}
                  tickFormatter={(value: number) => NUMBER.format(value)}
                />
                <Tooltip
                  formatter={(value: number) => NUMBER.format(value)}
                  labelFormatter={(hours: number) =>
                    `${hoursLabel(hours)} después`
                  }
                />
                <Line
                  type="monotone"
                  dataKey="views"
                  name="Vistas"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {post?.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1 self-start text-sm font-semibold text-primary underline"
          >
            Ver en la red <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
