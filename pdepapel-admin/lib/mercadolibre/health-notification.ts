import type { ReactElement } from "react";

import { MercadoLibreHealthSummary } from "@/emails/mercadolibre-health-summary";
import type {
  MercadoLibreHealthSummaryAction,
  MercadoLibreHealthSummaryGroup,
  MercadoLibreHealthSummaryItem,
} from "@/emails/mercadolibre-health-summary";
import { env } from "@/lib/env.mjs";
import { resend } from "@/lib/resend";

import type { MercadoLibreHealthIssue, MercadoLibreHealthSummary as HealthSummary } from "./health";

const ADMIN_NOTIFICATION_RECIPIENTS = [
  "web.christian.dev@gmail.com",
  "papeleria.pdepapel@gmail.com",
];

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
  totalIssues: number;
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
        label: "Reprocesar venta",
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
  }

  if (issue.permalink) {
    actions.push({ label: "Ver en Mercado Libre", href: issue.permalink });
  }

  return actions;
}

export function buildMercadoLibreHealthDigest({
  storeId,
  summary,
  now = new Date(),
}: {
  storeId: string;
  summary: HealthSummary;
  now?: Date;
}): MercadoLibreHealthDigest {
  const dashboardUrl = new URL(
    `/${encodeURIComponent(storeId)}/mercadolibre`,
    env.ADMIN_WEB_URL,
  ).toString();

  const itemsByKind = new Map<IssueKind, MercadoLibreHealthSummaryItem[]>();
  for (const issue of summary.issues) {
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

  const totalIssues = summary.issues.length;

  return {
    subject: `[Mercado Libre] ${totalIssues} ${totalIssues === 1 ? "revisión pendiente" : "revisiones pendientes"}`,
    generatedAt: formatGeneratedAt(now),
    totalIssues,
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
    `Resumen diario de Mercado Libre — ${digest.generatedAt}`,
    "Origen: revisión automática diaria de la conexión. No es una venta nueva.",
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

  lines.push("", `Abrir Mercado Libre en Administración: ${digest.dashboardUrl}`);

  return lines.join("\n");
}

export async function sendMercadoLibreHealthNotification({
  storeId,
  summary,
}: {
  storeId: string;
  summary: HealthSummary;
}) {
  if (env.NODE_ENV === "development" || summary.issues.length === 0) return;

  const digest = buildMercadoLibreHealthDigest({ storeId, summary });
  const { subject, ...emailProps } = digest;

  const response = await resend.emails.send({
    from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
    to: ADMIN_NOTIFICATION_RECIPIENTS,
    subject,
    headers: {
      "Idempotency-Key": `mercadolibre-health-${storeId}-${new Date().toISOString().slice(0, 10)}`,
    },
    react: MercadoLibreHealthSummary(emailProps) as ReactElement,
    text: renderMercadoLibreHealthDigestText(digest),
  });
  if (response.error) {
    throw new Error(
      `Resend rechazó la alerta de Mercado Libre: ${response.error.message}`,
    );
  }
}
