import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { TintBadge } from "../../pedidos/components/order-badges";

export type StatusTone = "mint" | "cream" | "sky" | "slate" | "pink" | "lavender";

export interface StatusCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  status: { label: string; tone: StatusTone };
  /** Filas «etiqueta: valor» con lo que hay configurado; nunca secretos. */
  facts?: { label: string; value: string }[];
  action?: { label: string; href: string; external?: boolean };
  children?: ReactNode;
}

/** Tarjeta de estado para Pagos e Integraciones: dice qué está activo y a dónde ir, sin mostrar claves. */
export function StatusCard({ icon: Icon, title, description, status, facts, action, children }: StatusCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            {title}
          </CardTitle>
          <TintBadge label={status.label} tone={status.tone} />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {(facts?.length || action || children) && (
        <CardContent className="flex flex-col gap-3">
          {facts && facts.length > 0 && (
            <dl className="grid gap-1 text-sm">
              {facts.map((fact) => (
                <div key={fact.label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{fact.label}</dt>
                  <dd className="truncate text-right font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {children}
          {action &&
            (action.external ? (
              <a href={action.href} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                {action.label}
              </a>
            ) : (
              <Link href={action.href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                {action.label}
              </Link>
            ))}
        </CardContent>
      )}
    </Card>
  );
}

export const CONFIGURED = { label: "Configurado", tone: "mint" as const };
export const MISSING = { label: "Sin configurar", tone: "cream" as const };
export const OPTIONAL_OFF = { label: "Opcional", tone: "slate" as const };
