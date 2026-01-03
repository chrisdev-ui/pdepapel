"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SHIPPINGCARRIERS } from "@/constants/shipping";
import { ShippingProvider, ShippingStatus } from "@prisma/enums";
import { Filter } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const STATUS_OPTIONS = [
  { value: ShippingStatus.Preparing, label: "📦 Preparando" },
  { value: ShippingStatus.Shipped, label: "🚀 Despachada" },
  { value: ShippingStatus.PickedUp, label: "📮 Recogido" },
  { value: ShippingStatus.InTransit, label: "⛟ En tránsito" },
  { value: ShippingStatus.OutForDelivery, label: "🚚 En reparto" },
  { value: ShippingStatus.Delivered, label: "🏠 Entregado" },
  { value: ShippingStatus.FailedDelivery, label: "❌ Entrega fallida" },
  { value: ShippingStatus.Returned, label: "🔙 Retornado" },
  { value: ShippingStatus.Cancelled, label: "🚫 Cancelado" },
  { value: ShippingStatus.Exception, label: "⚠️ Incidencia" },
];

const PROVIDER_OPTIONS = [
  { value: ShippingProvider.ENVIOCLICK, label: "EnvioClick" },
  { value: ShippingProvider.MANUAL, label: "Manual" },
  { value: ShippingProvider.NONE, label: "Sin definir" },
];

export function ShipmentFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusFilters = searchParams.get("status")?.split(",") || [];
  const providerFilters = searchParams.get("provider")?.split(",") || [];
  const carrierFilters = searchParams.get("carrier")?.split(",") || [];

  const createQueryString = useCallback(
    (params: Record<string, string | null>) => {
      const newSearchParams = new URLSearchParams(searchParams.toString());

      Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === "") {
          newSearchParams.delete(key);
        } else {
          newSearchParams.set(key, value);
        }
      });

      return newSearchParams.toString();
    },
    [searchParams],
  );

  const toggleFilter = (
    type: "status" | "provider" | "carrier",
    value: string,
  ) => {
    let currentFilters: string[] = [];

    if (type === "status") currentFilters = statusFilters;
    else if (type === "provider") currentFilters = providerFilters;
    else currentFilters = carrierFilters;

    const newFilters = currentFilters.includes(value)
      ? currentFilters.filter((f) => f !== value)
      : [...currentFilters, value];

    const queryString = createQueryString({
      [type]: newFilters.length > 0 ? newFilters.join(",") : null,
    });

    router.push(`${pathname}?${queryString}`);
  };

  const clearFilters = () => {
    router.push(pathname);
  };

  const hasActiveFilters =
    statusFilters.length > 0 ||
    providerFilters.length > 0 ||
    carrierFilters.length > 0;

  return (
    <div className="flex gap-2">
      {/* Status Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Estado
            {statusFilters.length > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {statusFilters.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Filtrar por estado</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={statusFilters.includes(option.value)}
              onCheckedChange={() => toggleFilter("status", option.value)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Provider Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Proveedor
            {providerFilters.length > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {providerFilters.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Filtrar por proveedor</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PROVIDER_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={providerFilters.includes(option.value)}
              onCheckedChange={() => toggleFilter("provider", option.value)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Carrier Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Transportadora
            {carrierFilters.length > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {carrierFilters.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-96 w-56 overflow-y-auto"
        >
          <DropdownMenuLabel>Filtrar por transportadora</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SHIPPINGCARRIERS.map((carrier) => (
            <DropdownMenuCheckboxItem
              key={carrier.idCarrier}
              checked={carrierFilters.includes(carrier.carrier)}
              onCheckedChange={() => toggleFilter("carrier", carrier.carrier)}
            >
              {carrier.comercialName}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
