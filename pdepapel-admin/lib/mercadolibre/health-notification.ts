import type { ReactElement } from "react";

import { MercadoLibreHealthSummary } from "@/emails/mercadolibre-health-summary";
import type {
  MercadoLibreHealthSummaryAction,
  MercadoLibreHealthSummaryGroup,
  MercadoLibreHealthSummaryItem,
} from "@/emails/mercadolibre-health-summary";
import { ADMIN_EMAIL_RECIPIENTS, sendWithRetry } from "@/lib/email-delivery";
import { env } from "@/lib/env.mjs";
import { resend } from "@/lib/resend";

import type { MercadoLibreHealthIssue, MercadoLibreHealthSummary as HealthSummary } from "./health";

/** Keeps the email scannable; the dashboard shows everything. */
export const MAX_ITEMS_PER_GROUP = 5;

type IssueKind = MercadoLibreHealthIssue["kind"];

const GROUP_META: Record<
  IssueKind,
  { order: number; title: string; description: string }
> = {
  shipment: {
    order: 1,
    title: "Envíos por despachar",
    description:
      "Mercado Libre ya cobró estas ventas. Despáchalas hoy para no afectar tu reputación.",
  },
  claim: {
    order: 2,
    title: "Reclamos por revisar",
    description:
      "Responde dentro del plazo de Mercado Libre. Revisa la venta vinculada antes de decidir.",
  },
  question: {
    order: 3,
    title: "Preguntas sin responder",
    description:
      "Una respuesta rápida suele convertir la pregunta en venta.",
  },
  listing_error: {
    order: 4,
    title: "Publicaciones con error",
    description:
      "Mercado Libre rechazó o pausó estas publicaciones. Corrige el motivo y vuelve a sincronizar.",
  },
  listing_incomplete: {
    order: 5,
    title: "Publicaciones incompletas",
    description:
      "Sin categoría, precio de Mercado Libre y al menos una foto no se pueden publicar.",
  },
  stock_risk: {
    order: 6,
    title: "Stock en riesgo",
    description:
      "El stock local ya alcanzó el colchón de seguridad; la publicación puede quedar sin unidades. Repón inventario o pausa la publicación.",
  },
  margin_risk: {
    order: 7,
    title: "Margen insuficiente",
    description:
      "El precio de Mercado Libre no cubre el margen mínimo antes de comisión, envío e impuestos.",
  },
  inventory_exception: {
    order: 0,
    title: "Ventas sin inventario aplicado",
    description:
      "Mercado Libre cobró la venta pero el inventario local no se movió. Reprocesa la venta o ajusta el stock a mano antes de que la tienda venda unidades que no existen.",
  },
  outbox_failed: {
    order: 8,
    title: "Cambios que Mercado Libre no aceptó",
    description:
      "Precio, stock o contenido que se intentó enviar y agotó los reintentos: la publicación puede mostrar datos viejos. Corrige el motivo y vuelve a sincronizar.",
  },
  webhook_failed: {
    order: 9,
    title: "Avisos sin procesar",
    description:
      "Notificaciones de Mercado Libre que no se pudieron aplicar. Ejecuta la recuperación de la cola desde el centro de operaciones.",
  },
  ml_order_missing: {
    order: -1,
    title: "Ventas que no llegaron al panel",
    description:
      "Mercado Libre las cobró y el inventario no se descontó. Re-sincronízalas antes de que la tienda venda unidades que ya no existen.",
  },
  ml_reauth: {
    order: -2,
    title: "Conexión vencida",
    description: "Sin conexión la revisión diaria no puede comparar nada con Mercado Libre.",
  },
  ml_listing_review: {
    order: 11,
    title: "Publicaciones en revisión",
    description: "Mercado Libre las tiene en revisión o pide un cambio. El motivo está en la publicación allá.",
  },
  ml_status_changed: {
    order: 12,
    title: "Publicaciones que cambiaron de estado",
    description: "Mercado Libre las pausó, cerró o activó. El panel ya refleja el estado nuevo.",
  },
  ml_price_mismatch: {
    order: 13,
    title: "Precios distintos",
    description: "El precio en Mercado Libre no coincide con el del panel. El panel no cambia ningún precio solo.",
  },
  ml_twin_mismatch: {
    order: 14,
    title: "Gemelas en desacuerdo",
    description: "Dos publicaciones del mismo producto de usuario comparten stock y SKU, pero no el estado.",
  },
  ml_unlinked_stock: {
    order: 15,
    title: "Publicaciones sin vincular con stock",
    description: "Están activas con unidades que ningún producto del panel controla.",
  },
  ml_unchecked: {
    order: 16,
    title: "Revisión incompleta",
    description: "Mercado Libre no respondió por una parte de las publicaciones; se vuelve a intentar mañana.",
  },
  settlement_pending: {
    order: 10,
    title: "Liquidaciones pendientes",
    description:
      "Ventas pagadas hace más de una semana sin neto reportado. Refresca el flujo de caja; si sigue vacío, revisa la liquidación en la cuenta.",
  },
};

export type MercadoLibreHealthDigest = {
  subject: string;
  generatedAt: string;
  /** Alertas nuevas o que cambiaron desde el último aviso: las que trae el correo. */
  totalIssues: number;
  /** Siguen abiertas y ya se avisaron (o se marcaron como revisadas): solo se cuentan. */
  knownIssues: number;
  dashboardUrl: string;
  metrics: {
    unansweredQuestions: number;
    shipmentsToDispatch: number;
    claimsRequiringAttention: number;
    activeListings: number;
    totalListings: number;
  };
  groups: MercadoLibreHealthSummaryGroup[];
  hiddenIssues: number;
};

function formatGeneratedAt(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function buildIssueActions(
  issue: MercadoLibreHealthIssue,
  { storeId, dashboardUrl }: { storeId: string; dashboardUrl: string },
): MercadoLibreHealthSummaryAction[] {
  const actions: MercadoLibreHealthSummaryAction[] = [];
  const listingUrl = issue.listingId
    ? `${dashboardUrl}?listing=${encodeURIComponent(issue.listingId)}#mercadolibre-listing-${issue.listingId}`
    : null;
  const orderUrl = issue.orderId
    ? `${dashboardUrl}?order=${encodeURIComponent(issue.orderId)}#mercadolibre-orders`
    : null;
  const productUrl = issue.productId
    ? new URL(
        `/${encodeURIComponent(storeId)}/productos/${encodeURIComponent(issue.productId)}`,
        env.ADMIN_WEB_URL,
      ).toString()
    : null;

  switch (issue.kind) {
    case "stock_risk":
      if (productUrl) actions.push({ label: "Ajustar stock", href: productUrl, primary: true });
      if (listingUrl) actions.push({ label: "Ver publicación", href: listingUrl });
      break;
    case "listing_error":
      if (listingUrl) actions.push({ label: "Corregir publicación", href: listingUrl, primary: true });
      break;
    case "listing_incomplete":
      if (listingUrl) actions.push({ label: "Completar publicación", href: listingUrl, primary: true });
      break;
    case "margin_risk":
      if (listingUrl) actions.push({ label: "Revisar precio", href: listingUrl, primary: true });
      break;
    case "question":
      actions.push({
        label: "Responder",
        href: `${dashboardUrl}#mercadolibre-operations`,
        primary: true,
      });
      if (listingUrl) actions.push({ label: "Ver publicación", href: listingUrl });
      break;
    case "shipment":
      actions.push({
        label: "Ver venta",
        href: orderUrl ?? `${dashboardUrl}#mercadolibre-orders`,
        primary: true,
      });
      break;
    case "claim":
      actions.push({
        label: orderUrl ? "Ver venta" : "Ver reclamos",
        href: orderUrl ?? `${dashboardUrl}#mercadolibre-operations`,
        primary: true,
      });
      break;
    case "inventory_exception":
      actions.push({
        // Mismo nombre que el botón de la lista de ventas.
        label: "Re-sincronizar venta",
        href: orderUrl ?? `${dashboardUrl}#mercadolibre-orders`,
        primary: true,
      });
      break;
    case "outbox_failed":
      if (listingUrl) actions.push({ label: "Ver publicación", href: listingUrl, primary: true });
      actions.push({ label: "Recuperar cola", href: `${dashboardUrl}#mercadolibre-operations` });
      break;
    case "webhook_failed":
      actions.push({ label: "Recuperar cola", href: `${dashboardUrl}#mercadolibre-operations`, primary: true });
      break;
    case "settlement_pending":
      actions.push({
        label: "Ver flujo de caja",
        href: `${dashboardUrl}#mercadolibre-cashflow`,
        primary: true,
      });
      if (orderUrl) actions.push({ label: "Ver venta", href: orderUrl });
      break;
    case "ml_price_mismatch":
    case "ml_status_changed":
    case "ml_listing_review":
    case "ml_twin_mismatch":
      if (listingUrl) actions.push({ label: "Ver publicación", href: listingUrl, primary: true });
      break;
    case "ml_unlinked_stock":
      actions.push({ label: "Importar existentes", href: `${dashboardUrl}?tab=publicaciones`, primary: true });
      break;
    case "ml_order_missing":
      if (issue.externalOrderId) {
        actions.push({
          label: "Ver venta en Mercado Libre",
          href: `https://www.mercadolibre.com.co/ventas/${encodeURIComponent(issue.externalOrderId)}/detalle`,
          primary: true,
        });
      }
      actions.push({ label: "Ventas del panel", href: `${dashboardUrl}?tab=ventas` });
      break;
    case "ml_reauth":
      actions.push({ label: "Abrir Mercado Libre en el panel", href: dashboardUrl, primary: true });
      break;
    case "ml_unchecked":
      actions.push({ label: "Abrir el centro de operaciones", href: `${dashboardUrl}#mercadolibre-operations`, primary: true });
      break;
  }

  if (issue.permalink) {
    actions.push({ label: "Ver en Mercado Libre", href: issue.permalink });
  }

  return actions;
}

export function buildMercadoLibreHealthDigest({
  storeId,
  summary,
  issues = summary.issues,
  knownIssues = 0,
  now = new Date(),
}: {
  storeId: string;
  summary: HealthSummary;
  /** Las alertas que van en el correo (las nuevas o que cambiaron). */
  issues?: MercadoLibreHealthIssue[];
  knownIssues?: number;
  now?: Date;
}): MercadoLibreHealthDigest {
  const dashboardUrl = new URL(
    `/${encodeURIComponent(storeId)}/mercadolibre`,
    env.ADMIN_WEB_URL,
  ).toString();

  const itemsByKind = new Map<IssueKind, MercadoLibreHealthSummaryItem[]>();
  for (const issue of issues) {
    const items = itemsByKind.get(issue.kind) ?? [];
    items.push({
      title: issue.title,
      detail: issue.detail,
      actions: buildIssueActions(issue, { storeId, dashboardUrl }),
    });
    itemsByKind.set(issue.kind, items);
  }

  let hiddenIssues = 0;
  const groups = Array.from(itemsByKind.entries())
    .sort(([a], [b]) => GROUP_META[a].order - GROUP_META[b].order)
    .map(([kind, items]) => {
      const hidden = Math.max(0, items.length - MAX_ITEMS_PER_GROUP);
      hiddenIssues += hidden;
      return {
        kind,
        title: GROUP_META[kind].title,
        description: GROUP_META[kind].description,
        items: items.slice(0, MAX_ITEMS_PER_GROUP),
        hidden,
      };
    });

  const totalIssues = issues.length;

  return {
    subject: `Mercado Libre: ${totalIssues} ${totalIssues === 1 ? "cosa para revisar" : "cosas para revisar"}`,
    generatedAt: formatGeneratedAt(now),
    totalIssues,
    knownIssues,
    dashboardUrl,
    metrics: {
      unansweredQuestions: summary.unansweredQuestions,
      shipmentsToDispatch: summary.shipmentsToDispatch,
      claimsRequiringAttention: summary.claimsRequiringAttention,
      activeListings: summary.activeListings,
      totalListings: summary.totalListings,
    },
    groups,
    hiddenIssues,
  };
}

export function renderMercadoLibreHealthDigestText(
  digest: MercadoLibreHealthDigest,
) {
  const lines = [
    `Mercado Libre: ${digest.totalIssues === 1 ? "1 cosa para revisar" : `${digest.totalIssues} cosas para revisar`} — ${digest.generatedAt}`,
    "Origen: revisión automática diaria de la conexión. No es una venta nueva.",
    "Solo trae lo nuevo o lo que cambió desde el último aviso.",
    "",
    `Preguntas sin responder: ${digest.metrics.unansweredQuestions} · Envíos por despachar: ${digest.metrics.shipmentsToDispatch} · Reclamos por revisar: ${digest.metrics.claimsRequiringAttention}`,
    `Publicaciones activas: ${digest.metrics.activeListings} de ${digest.metrics.totalListings}`,
  ];

  for (const group of digest.groups) {
    lines.push("", `## ${group.title} (${group.items.length + group.hidden})`, group.description);
    for (const item of group.items) {
      lines.push(`- ${item.title}: ${item.detail}`);
      for (const action of item.actions) {
        lines.push(`  ${action.label}: ${action.href}`);
      }
    }
    if (group.hidden > 0) {
      lines.push(`  (+${group.hidden} más en Administración)`);
    }
  }

  if (digest.knownIssues > 0) {
    lines.push(
      "",
      digest.knownIssues === 1
        ? "Además sigue abierta 1 alerta que ya conoces; está en el panel."
        : `Además siguen abiertas ${digest.knownIssues} alertas que ya conoces; están en el panel.`,
    );
  }
  lines.push("", `Abrir Mercado Libre en Administración: ${digest.dashboardUrl}`);

  return lines.join("\n");
}

/**
 * Manda el aviso con las alertas nuevas o que cambiaron. Quien decide cuáles
 * son es health-cron.ts (con health-alerts.ts): aquí no se deduplica nada.
 *
 * Devuelve "skipped" en desarrollo (no se manda nada) y lanza si Resend no lo
 * aceptó tras los reintentos, para que quien llama devuelva las alertas
 * tomadas y la próxima corrida lo intente de nuevo.
 *
 * Antes se pasaba un `Idempotency-Key` dentro de `headers`, pero en el SDK
 * 2.1.0 ese campo agrega encabezados al correo, no a la llamada a la API: no
 * deduplicaba nada.
 */
export async function sendMercadoLibreHealthNotification({
  storeId,
  summary,
  issues,
  knownIssues = 0,
}: {
  storeId: string;
  summary: HealthSummary;
  issues: MercadoLibreHealthIssue[];
  knownIssues?: number;
}): Promise<"sent" | "skipped"> {
  if (env.NODE_ENV === "development" || issues.length === 0) return "skipped";

  const digest = buildMercadoLibreHealthDigest({ storeId, summary, issues, knownIssues });
  const { subject, ...emailProps } = digest;

  const outcome = await sendWithRetry(() =>
    resend.emails.send({
      from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
      to: ADMIN_EMAIL_RECIPIENTS,
      subject,
      react: MercadoLibreHealthSummary(emailProps) as ReactElement,
      text: renderMercadoLibreHealthDigestText(digest),
    }),
  );
  if (!outcome.ok) {
    throw new Error(`Resend rechazó la alerta de Mercado Libre: ${outcome.error}`);
  }
  return "sent";
}
