/**
 * «Lista para papelitos» de una edición de cápsulas en combos (solo lectura, pdepapel_ro): lo que lleva 90 días sin
 * venderse y puede ir en un papel, por banda de costo, más la línea base de unidades y plata quieta para medir el remate.
 *
 * Entra un producto si es «lento» con la regla del Copiloto (`rankSlowMovers`: disponible > 0, no kit, no archivado,
 * 90 días en inventario y ninguna venta en 90 días, suelta o dentro de un kit) y además:
 * - no está en una preventa activa ni tiene fecha de «Próximamente»;
 * - no es de «Kits sorpresa» ni de una edición de cápsulas;
 * - no está entre los 10 más vendidos del año (la misma cuenta del panel);
 * - su precio en la tienda está entre $5.000 y $35.000 (lo que prometen los términos 2026-11-03).
 * Lo lento que queda fuera por precio o por no tener costo se cuenta aparte, sin listarse como papel.
 *
 * Bandas por costo unitario (compra + transporte), a $5.800 por cápsula en el combo x15:
 *   verde ≤ $4.000 · amarilla $4.001–$5.500 · roja > $5.500 (pierde plata: solo como «premio» raro).
 *
 * Uso (desde pdepapel-admin, con el .env del checkout principal):
 *   npx tsx --env-file=<checkout principal>/pdepapel-admin/.env scripts/capsule-papelitos-pdf.tsx --edition "Cyber" --out <carpeta>
 * Escribe <carpeta>/lista-papelitos-<edición>-<fecha>.pdf y linea-base-papelitos-<edición>-<fecha>.json.
 */
import "./lib/allow-server-only.cjs";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PrismaClient } from "@prisma/client";
import React from "react";

import { CAPSULAS_SORPRESA_ID } from "@/constants";
import { createSettledMarketplaceSalesWhere } from "@/lib/mercadolibre/reporting";
import { revenueOrderWhere } from "@/lib/revenue-orders";
import { DEFAULT_SLOW_DAYS, loadFirstStockedAt, loadSalesHistory, rankSlowMovers, stockedSinceOf, unitCostOf } from "@/lib/sales-velocity";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const PRICE_MIN = 5_000;
const PRICE_MAX = 35_000;
const GREEN_MAX = 4_000;
const YELLOW_MAX = 5_500;
const TOP_SELLERS = 10;

type Band = "verde" | "amarilla" | "roja";
const BANDS: { key: Band; title: string; guide: string; color: string; light: string }[] = [
  { key: "verde", title: "Verde · costo hasta $4.000", guide: "Úsalos libremente: dejan margen en cualquier combo.", color: "#1f7a3a", light: "#e6f4ea" },
  { key: "amarilla", title: "Amarilla · costo $4.001 a $5.500", guide: "Con medida: mezcla uno de estos con varios verdes.", color: "#8a6100", light: "#fdf3d7" },
  { key: "roja", title: "Roja · costo más de $5.500", guide: "Pierde plata a $5.800 por cápsula: solo como «premio» raro.", color: "#a12622", light: "#fbe4e3" },
];
const bandOf = (cost: number): Band => (cost <= GREEN_MAX ? "verde" : cost <= YELLOW_MAX ? "amarilla" : "roja");

const argValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};
const pesos = (value: number) => `$${Math.round(value).toLocaleString("es-CO")}`;

interface Row {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  unitCost: number;
  available: number;
  tiedUpAtCost: number;
  daysSinceLastSale: number | null;
  band: Band;
}

async function topSellerIds(db: PrismaClient, now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 5));
  const [shop, marketplace] = await Promise.all([
    db.orderItem.groupBy({ by: ["productId"], where: { productId: { not: null }, order: { storeId: STORE_ID, ...revenueOrderWhere(), createdAt: { gte: start, lte: now } } }, _sum: { quantity: true } }),
    db.marketplaceOrderItem.groupBy({ by: ["productId"], where: { productId: { not: null }, marketplaceOrder: createSettledMarketplaceSalesWhere(STORE_ID, { start, end: now }) }, _sum: { quantity: true } }),
  ]);
  const units = new Map<string, number>();
  for (const row of [...shop, ...marketplace]) if (row.productId) units.set(row.productId, (units.get(row.productId) ?? 0) + (row._sum.quantity ?? 0));
  return new Set(Array.from(units).sort((a, b) => b[1] - a[1]).slice(0, TOP_SELLERS).map(([id]) => id));
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#1d2b4f" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#4a5578", marginBottom: 8 },
  summary: { flexDirection: "row", gap: 6, marginBottom: 10 },
  summaryBox: { flexGrow: 1, borderRadius: 4, padding: 6 },
  summaryLabel: { fontSize: 8 },
  summaryValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  bandHeader: { flexDirection: "row", justifyContent: "space-between", padding: 5, borderRadius: 3, marginTop: 8 },
  bandTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  bandGuide: { fontSize: 8, color: "#ffffff" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#9aa3bd", paddingVertical: 3, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d5d9e6", paddingVertical: 3 },
  check: { width: 14 },
  box: { width: 8, height: 8, borderWidth: 0.8, borderColor: "#1d2b4f", marginTop: 1 },
  name: { flexGrow: 1, flexBasis: 0, paddingRight: 4 },
  sku: { width: 112, color: "#4a5578" },
  num: { width: 52, textAlign: "right" },
  note: { fontSize: 8, color: "#4a5578", marginTop: 10, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, fontSize: 7, color: "#7a839e", flexDirection: "row", justifyContent: "space-between" },
});

function PapelitosPdf(props: { edition: string; dateLabel: string; rows: Row[]; totals: { units: number; cost: number }; byBand: Record<Band, { count: number; units: number; cost: number }>; outside: string[] }) {
  const h = React.createElement;
  return h(
    Document,
    { title: `Lista para papelitos — Edición ${props.edition}`, author: "P de Papel" },
    h(
      Page,
      { size: "LETTER", style: styles.page, wrap: true },
      h(Text, { style: styles.title }, `Lista para papelitos — Edición ${props.edition}`),
      h(Text, { style: styles.subtitle }, `Inventario quieto al ${props.dateLabel}: 90 días o más sin venderse, con precio en la tienda de ${pesos(PRICE_MIN)} a ${pesos(PRICE_MAX)}. Un papel = una unidad. Marca la casilla cuando escribas sus papeles.`),
      h(
        View,
        { style: styles.summary },
        h(View, { style: [styles.summaryBox, { backgroundColor: "#eef1f8" }] }, h(Text, { style: styles.summaryLabel }, "Línea base"), h(Text, { style: styles.summaryValue }, `${props.totals.units} unidades · ${pesos(props.totals.cost)} a costo`)),
        ...BANDS.map((band) =>
          h(
            View,
            { key: band.key, style: [styles.summaryBox, { backgroundColor: band.light }] },
            h(Text, { style: [styles.summaryLabel, { color: band.color }] }, band.key[0].toUpperCase() + band.key.slice(1)),
            h(Text, { style: [styles.summaryValue, { color: band.color }] }, `${props.byBand[band.key].units} u · ${pesos(props.byBand[band.key].cost)}`),
          ),
        ),
      ),
      ...BANDS.flatMap((band) => {
        const rows = props.rows.filter((row) => row.band === band.key);
        if (rows.length === 0) return [];
        return [
          h(
            View,
            { key: `${band.key}-head`, style: [styles.bandHeader, { backgroundColor: band.color }], wrap: false, minPresenceAhead: 40 },
            h(Text, { style: styles.bandTitle }, `${band.title} · ${rows.length} productos · ${props.byBand[band.key].units} unidades`),
            h(Text, { style: styles.bandGuide }, band.guide),
          ),
          h(
            View,
            { key: `${band.key}-cols`, style: styles.headRow, fixed: false },
            h(Text, { style: styles.check }, ""),
            h(Text, { style: styles.name }, "Producto"),
            h(Text, { style: styles.sku }, "SKU"),
            h(Text, { style: styles.num }, "Unidades"),
            h(Text, { style: styles.num }, "Precio"),
            h(Text, { style: styles.num }, "Costo"),
          ),
          ...rows.map((row) =>
            h(
              View,
              { key: row.id, style: styles.row, wrap: false },
              h(View, { style: styles.check }, h(View, { style: styles.box })),
              h(Text, { style: styles.name }, row.name),
              h(Text, { style: styles.sku }, row.sku),
              h(Text, { style: styles.num }, String(row.available)),
              h(Text, { style: styles.num }, pesos(row.price)),
              h(Text, { style: styles.num }, pesos(row.unitCost)),
            ),
          ),
        ];
      }),
      h(
        Text,
        { style: styles.note },
        `Si al empacar un producto ya no está, no lo escribas. Si sale un papel de un producto que se agotó, se entrega otro de igual o mayor precio (términos 2026-11-03). Fuera de la lista: preventas, «Próximamente», kits, cápsulas, archivados, los ${TOP_SELLERS} más vendidos del año y lo que cuesta menos de ${pesos(PRICE_MIN)} o más de ${pesos(PRICE_MAX)} en la tienda.` +
          (props.outside.length ? ` ${props.outside.join(" ")}` : ""),
      ),
      h(View, { style: styles.footer, fixed: true }, h(Text, null, `P de Papel · Edición ${props.edition} · ${props.dateLabel}`), h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` })),
    ),
  );
}

async function main() {
  const edition = argValue("--edition") ?? "Cyber";
  const outDir = argValue("--out");
  if (!outDir) throw new Error("falta --out <carpeta>.");
  const db = new PrismaClient();
  try {
    const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
    if (!user.startsWith("pdepapel_ro@")) throw new Error("este informe corre solo con pdepapel_ro.");

    const now = new Date();
    const [products, firstStocked, history, top] = await Promise.all([
      db.product.findMany({
        where: { storeId: STORE_ID, isArchived: false, isKit: false },
        select: {
          id: true, sku: true, name: true, price: true, stock: true, reservedUnits: true, isKit: true, isArchived: true, createdAt: true, availableAt: true,
          acqPrice: true, transportationCost: true, categoryId: true,
          category: { select: { name: true } },
          capsuleEdition: { select: { id: true } },
          presales: { where: { status: "ACTIVE" }, select: { id: true } },
        },
      }),
      loadFirstStockedAt(db, STORE_ID),
      loadSalesHistory(db, STORE_ID, { days: DEFAULT_SLOW_DAYS, now }),
      topSellerIds(db, now),
    ]);
    if (history.truncated) throw new Error("el historial de ventas llegó al tope de filas: las cifras saldrían cortas.");

    const byId = new Map(products.map((product) => [product.id, product]));
    const slow = rankSlowMovers(
      products.map((product) => ({
        id: product.id, name: product.name, stock: product.stock, reservedUnits: product.reservedUnits, isKit: product.isKit, isArchived: product.isArchived,
        stockedSince: stockedSinceOf(firstStocked, product), unitCost: unitCostOf(product),
      })),
      history,
    );

    const excluded = { preventa: 0, proximamente: 0, capsulas: 0, top: 0, sinCosto: 0, bajoPrecio: 0, sobrePrecio: 0 };
    const excludedUnits = { bajoPrecio: 0, sobrePrecio: 0, sinCosto: 0 };
    const rows: Row[] = [];
    for (const item of slow) {
      const product = byId.get(item.id)!;
      if (product.presales.length > 0) { excluded.preventa += 1; continue; }
      if (product.availableAt && product.availableAt > now) { excluded.proximamente += 1; continue; }
      if (product.categoryId === CAPSULAS_SORPRESA_ID || product.capsuleEdition) { excluded.capsulas += 1; continue; }
      if (top.has(product.id)) { excluded.top += 1; continue; }
      if (product.price < PRICE_MIN) { excluded.bajoPrecio += 1; excludedUnits.bajoPrecio += item.available; continue; }
      if (product.price > PRICE_MAX) { excluded.sobrePrecio += 1; excludedUnits.sobrePrecio += item.available; continue; }
      if (item.unitCost === null || item.unitCost <= 0) { excluded.sinCosto += 1; excludedUnits.sinCosto += item.available; continue; }
      rows.push({
        id: product.id, sku: product.sku, name: product.name, category: product.category.name, price: product.price, unitCost: item.unitCost,
        available: item.available, tiedUpAtCost: item.available * item.unitCost, daysSinceLastSale: item.daysSinceLastSale, band: bandOf(item.unitCost),
      });
    }
    rows.sort((a, b) => a.unitCost - b.unitCost || a.name.localeCompare(b.name, "es"));

    const byBand = Object.fromEntries(BANDS.map(({ key }) => [key, { count: 0, units: 0, cost: 0 }])) as Record<Band, { count: number; units: number; cost: number }>;
    for (const row of rows) {
      byBand[row.band].count += 1;
      byBand[row.band].units += row.available;
      byBand[row.band].cost += row.tiedUpAtCost;
    }
    for (const band of Object.values(byBand)) band.cost = Math.round(band.cost);
    const totals = { units: rows.reduce((sum, row) => sum + row.available, 0), cost: Math.round(rows.reduce((sum, row) => sum + row.tiedUpAtCost, 0)) };
    const allSlow = { products: slow.length, units: slow.reduce((sum, row) => sum + row.available, 0), cost: Math.round(slow.reduce((sum, row) => sum + (row.tiedUpAtCost ?? 0), 0)) };

    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
    const dateLabel = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" }).format(now);
    const outside = [
      excluded.bajoPrecio ? `${excluded.bajoPrecio} productos lentos valen menos de ${pesos(PRICE_MIN)} (${excludedUnits.bajoPrecio} u).` : "",
      excluded.sobrePrecio ? `${excluded.sobrePrecio} valen más de ${pesos(PRICE_MAX)} (${excludedUnits.sobrePrecio} u).` : "",
      excluded.sinCosto ? `${excluded.sinCosto} no tienen costo cargado (${excludedUnits.sinCosto} u): cárgalo en Productos para poder usarlos.` : "",
    ].filter(Boolean);

    const slug = edition.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
    mkdirSync(outDir, { recursive: true });
    const pdfPath = join(outDir, `lista-papelitos-${slug}-${date}.pdf`);
    const jsonPath = join(outDir, `linea-base-papelitos-${slug}-${date}.json`);
    const buffer = await renderToBuffer(PapelitosPdf({ edition, dateLabel, rows, totals, byBand, outside }) as React.ReactElement);
    writeFileSync(pdfPath, buffer);
    writeFileSync(
      jsonPath,
      `${JSON.stringify(
        {
          edition, generatedAt: now.toISOString(), rule: { slowDays: DEFAULT_SLOW_DAYS, priceMin: PRICE_MIN, priceMax: PRICE_MAX, greenMax: GREEN_MAX, yellowMax: YELLOW_MAX, topSellersExcluded: TOP_SELLERS },
          totals, byBand, allSlow, excluded, excludedUnits,
          products: rows.map(({ id, sku, name, available, unitCost, price, band }) => ({ id, sku, name, available, unitCost, price, band })),
        },
        null,
        1,
      )}\n`,
    );
    console.log(JSON.stringify({ pdfPath, jsonPath, listed: rows.length, totals, byBand, allSlow, excluded, excludedUnits }, null, 1));
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
