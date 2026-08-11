import { env } from "@/lib/env.mjs";
import { resend } from "@/lib/resend";

import type { MercadoLibreHealthSummary } from "./health";

const ADMIN_NOTIFICATION_RECIPIENTS = [
  "web.christian.dev@gmail.com",
  "papeleria.pdepapel@gmail.com",
];

export async function sendMercadoLibreHealthNotification({
  storeId,
  summary,
}: {
  storeId: string;
  summary: MercadoLibreHealthSummary;
}) {
  if (env.NODE_ENV === "development" || summary.issues.length === 0) return;

  const dashboardUrl = new URL(
    `/${encodeURIComponent(storeId)}/mercadolibre`,
    env.ADMIN_WEB_URL,
  ).toString();
  const issueList = summary.issues
    .slice(0, 10)
    .map((issue) => `- ${issue.title}: ${issue.detail}`)
    .join("\n");
  const response = await resend.emails.send({
    from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
    to: ADMIN_NOTIFICATION_RECIPIENTS,
    subject: `[Mercado Libre] ${summary.issues.length} revisión(es) pendiente(s)`,
    headers: {
      "Idempotency-Key": `mercadolibre-health-${storeId}-${new Date().toISOString().slice(0, 10)}`,
    },
    text: `Resumen diario de Mercado Libre\nOrigen del aviso: revisión automática diaria de la conexión; no es una venta nueva.\n\nPreguntas sin responder: ${summary.unansweredQuestions}\nEnvíos por despachar: ${summary.shipmentsToDispatch}\nReclamos por revisar: ${summary.claimsRequiringAttention}\n\n${issueList}\n\nAbrir Administración: ${dashboardUrl}`,
  });
  if (response.error) {
    throw new Error(
      `Resend rechazó la alerta de Mercado Libre: ${response.error.message}`,
    );
  }
}
