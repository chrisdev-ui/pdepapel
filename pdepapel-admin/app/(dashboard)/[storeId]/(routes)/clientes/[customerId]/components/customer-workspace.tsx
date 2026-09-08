"use client";

import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatus } from "@prisma/client";
import { SEGMENT_LABELS, daysSince, normalizePhone } from "@/lib/customer-views";
import { getOrderChannel } from "@/lib/order-queues";
import { currencyFormatter } from "@/lib/utils";

import { CHANNEL_TONE, TintBadge } from "../../../pedidos/components/order-badges";
import { relativeDate } from "../../../pedidos/components/columns";
import { formatPhone } from "../../components/columns";
import { ReactivationDialog } from "../../components/reactivation-dialog";
import type { CustomerDetail } from "../../server/get-customers";

interface CustomerWorkspaceProps {
  detail: CustomerDetail;
  storeId: string;
  storeName: string;
  storeUrl: string;
}

const DATE = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

const ORDER_STATUS: Partial<Record<OrderStatus, { label: string; tone: string }>> = {
  PAID: { label: "Pagado", tone: "mint" },
  SENT: { label: "Enviado", tone: "sky" },
  PENDING: { label: "Pendiente", tone: "cream" },
  CREATED: { label: "Creado", tone: "cream" },
  CANCELLED: { label: "Cancelado", tone: "pink" },
  REJECTED: { label: "Rechazado", tone: "pink" },
  DRAFT: { label: "Borrador", tone: "slate" },
  QUOTATION: { label: "Cotización", tone: "lavender" },
  VIEWED: { label: "Vista", tone: "lavender" },
  ACCEPTED: { label: "Aceptada", tone: "lavender" },
};

const REACTIVATION_STATUS: Record<string, string> = {
  SENT: "Correo enviado",
  OPENED: "Correo abierto",
  CLICKED: "Hizo clic",
  FAILED: "Falló el envío",
};

export function CustomerWorkspace({ detail, storeId, storeName, storeUrl }: CustomerWorkspaceProps) {
  const { customer, reactivations } = detail;
  const [reactivating, setReactivating] = useState(false);
  const segment = SEGMENT_LABELS[customer.segment];
  const inactiveDays = daysSince(customer.lastPaidAt);

  const kpis = [
    { label: "Compras pagadas", value: String(customer.paidOrders), hint: `${customer.totalOrders} pedidos en total` },
    { label: "Gastado", value: currencyFormatter(customer.totalSpent), hint: customer.averageOrderValue > 0 ? `Ticket ${currencyFormatter(customer.averageOrderValue)}` : "Sin compras pagadas" },
    { label: "Unidades", value: String(customer.totalItems), hint: customer.favoriteProducts[0] ? `Prefiere ${customer.favoriteProducts[0].name}` : "—" },
    { label: "Última compra", value: customer.lastPaidAt ? relativeDate(customer.lastPaidAt) : "Nunca", hint: customer.lastPaidAt ? DATE.format(customer.lastPaidAt) : `Cliente desde ${DATE.format(customer.firstOrderAt)}` },
  ];

  return (
    <>
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">{customer.fullName}</h1>
            <TintBadge label={segment.label} tone={segment.tone} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {formatPhone(customer.phone)}
            </a>
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                {customer.email}
              </a>
            )}
            {customer.city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {customer.city}
              </span>
            )}
          </div>
          {customer.segment === "inactivo" && inactiveDays !== null && (
            <p className="text-sm text-muted-foreground">
              Lleva {inactiveDays} días sin comprar. Un mensaje corto con novedades suele traerle de vuelta.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline">
            <a href={`https://wa.me/${normalizePhone(customer.phone)}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              WhatsApp
            </a>
          </Button>
          {customer.segment === "inactivo" && (
            <Button type="button" onClick={() => setReactivating(true)}>
              Reactivar
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
            <p className="mt-1 truncate text-2xl font-bold tabular-nums text-primary">{kpi.value}</p>
            <p className="truncate text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Pedidos</CardTitle>
            <CardDescription>Todos los pedidos con este teléfono, del más reciente al más antiguo.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="min-w-0 divide-y">
              {customer.orders.map((order) => {
                const channel = getOrderChannel(order.type);
                const status = ORDER_STATUS[order.status] ?? { label: order.status, tone: "slate" };
                return (
                  <li key={order.id}>
                    <Link href={`/${storeId}/pedidos/${order.id}`} className="flex min-w-0 items-center gap-3 px-6 py-3 transition-colors hover:bg-accent/50">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-primary">{order.orderNumber}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ") || "Sin productos"}
                        </span>
                      </span>
                      <TintBadge label={channel.label} tone={CHANNEL_TONE[channel.id]} className="hidden sm:inline-flex" />
                      <TintBadge label={status.label} tone={status.tone} />
                      <span className="w-24 text-right text-sm font-semibold tabular-nums">{currencyFormatter(order.total)}</span>
                      <span className="hidden w-24 text-right text-xs text-muted-foreground sm:block">{relativeDate(order.createdAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lo que más compra</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.favoriteProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no tiene compras pagadas.</p>
              ) : (
                <ul className="space-y-2">
                  {customer.favoriteProducts.map((product) => (
                    <li key={product.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{product.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{product.count} ud.</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reactivaciones</CardTitle>
              <CardDescription>Correos automáticos a los 90 días sin comprar.</CardDescription>
            </CardHeader>
            <CardContent>
              {reactivations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {customer.email ? "Sin correos de reactivación todavía." : "Sin correo registrado: solo se puede escribir por WhatsApp."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {reactivations.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {REACTIVATION_STATUS[item.status] ?? item.status}
                        {item.couponUsed && <span className="text-xs text-muted-foreground"> · usó el cupón</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{relativeDate(item.sentAt ?? item.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ReactivationDialog
        open={reactivating}
        onOpenChange={setReactivating}
        customers={[{ id: customer.id, fullName: customer.fullName, phone: customer.phone }]}
        storeName={storeName}
        storeUrl={storeUrl}
      />
    </>
  );
}
