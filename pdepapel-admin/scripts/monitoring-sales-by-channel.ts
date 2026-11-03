/**
 * «Ventas por canal» del monitoreo semanal (docs/monitoreo.md), solo lectura.
 * Cuenta pedidos y suma totales por canal (Order.salesChannel, o lo que
 * implica el sistema que escribió el pedido) en la semana del informe y la
 * anterior. Escribe output/monitoreo/raw/<fecha>/ventas.json directo, como
 * psi-run.mjs: ningún número pasa por un modelo. Sin datos de clientas.
 *
 * Venta = pedido pagado en la semana (paidAt), más contra entrega enviado en
 * la semana que todavía no se marcó pagado (suele no marcarse nunca).
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/monitoring-sales-by-channel.ts --date YYYY-MM-DD
 *   (con el .env de solo lectura, pdepapel_ro)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { OrderStatus, PaymentMethod, PrismaClient } from "@prisma/client";

import { REPORT_CHANNEL_LABELS, reportChannelOf, SALES_CHANNELS, type SalesReportChannel } from "@/lib/order-sales-channel";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const DAY_MS = 86_400_000;
const REPORT_CHANNELS: SalesReportChannel[] = [...SALES_CHANNELS, "TIENDA", "SIN_REGISTRAR"];

const args = process.argv.slice(2);
const dateArg = args.includes("--date") ? args[args.indexOf("--date") + 1] : undefined;
const today = dateArg ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("--date YYYY-MM-DD");

// Bogotá is UTC-5 all year: a Bogotá day starts at 05:00 UTC.
const bogotaStart = (day: string) => new Date(`${day}T05:00:00.000Z`);
const reportStart = bogotaStart(today);
const windows = {
  current: { from: new Date(reportStart.getTime() - 7 * DAY_MS), to: reportStart },
  previous: { from: new Date(reportStart.getTime() - 14 * DAY_MS), to: new Date(reportStart.getTime() - 7 * DAY_MS) },
};

const EXCLUDED: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.DRAFT, OrderStatus.QUOTATION];

async function salesIn(prisma: PrismaClient, from: Date, to: Date) {
  const orders = await prisma.order.findMany({
    where: {
      storeId: STORE_ID,
      status: { notIn: EXCLUDED },
      OR: [
        { paidAt: { gte: from, lt: to } },
        { paidAt: null, status: OrderStatus.SENT, payment: { method: PaymentMethod.COD }, createdAt: { gte: from, lt: to } },
      ],
    },
    select: { salesChannel: true, source: true, total: true },
  });
  const byChannel = Object.fromEntries(REPORT_CHANNELS.map((channel) => [channel, { orders: 0, cop: 0 }])) as Record<SalesReportChannel, { orders: number; cop: number }>;
  for (const order of orders) {
    const bucket = byChannel[reportChannelOf(order)];
    bucket.orders += 1;
    bucket.cop += Math.round(order.total);
  }
  return { orders: orders.length, cop: orders.reduce((sum, order) => sum + Math.round(order.total), 0), byChannel };
}

function outputDir() {
  if (process.env.MONITOREO_DIR) return process.env.MONITOREO_DIR;
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  return path.join(path.dirname(common), "output", "monitoreo");
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const [current, previous] = await Promise.all([
      salesIn(prisma, windows.current.from, windows.current.to),
      salesIn(prisma, windows.previous.from, windows.previous.to),
    ]);
    const key = (channel: SalesReportChannel) => channel.toLowerCase();
    const metrics: Record<string, { current: number; previous: number }> = {
      "ventas.orders": { current: current.orders, previous: previous.orders },
      "ventas.total_cop": { current: current.cop, previous: previous.cop },
    };
    for (const channel of REPORT_CHANNELS) {
      metrics[`ventas.${key(channel)}.orders`] = { current: current.byChannel[channel].orders, previous: previous.byChannel[channel].orders };
      metrics[`ventas.${key(channel)}.cop`] = { current: current.byChannel[channel].cop, previous: previous.byChannel[channel].cop };
    }
    const raw = {
      source: "ventas",
      ok: true,
      collectedAt: new Date().toISOString(),
      collectedVia: "base de datos (pdepapel_ro), scripts/monitoring-sales-by-channel.ts",
      error: null,
      metrics,
      details: [
        {
          title: "Ventas por canal (pedidos pagados + contra entrega enviados)",
          columns: ["Canal", "Pedidos", "Total", "Semana anterior: pedidos", "Semana anterior: total"],
          rows: REPORT_CHANNELS.map((channel) => [
            REPORT_CHANNEL_LABELS[channel],
            current.byChannel[channel].orders,
            `$${current.byChannel[channel].cop.toLocaleString("es-CO")}`,
            previous.byChannel[channel].orders,
            `$${previous.byChannel[channel].cop.toLocaleString("es-CO")}`,
          ]),
        },
      ],
      notes: [
        "«Sin registrar»: pedidos del panel creados antes de que existiera el campo de canal (2026-11-13) o sin elegirlo.",
      ],
    };
    const dir = path.join(outputDir(), "raw", today);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "ventas.json"), `${JSON.stringify(raw, null, 2)}\n`);
    console.log(`ventas.json escrito: ${current.orders} ventas esta semana, ${previous.orders} la anterior`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Name and Prisma code only: a connection message can carry the host.
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  console.error("ventas por canal falló:", error instanceof Error ? error.name : "error", code);
  process.exit(1);
});
