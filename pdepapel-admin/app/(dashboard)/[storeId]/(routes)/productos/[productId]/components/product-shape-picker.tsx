"use client";

import { cn } from "@/lib/utils";
import { Boxes, Layers, Package } from "lucide-react";
import { useRouter } from "next/navigation";

export type ProductShapeChoice = "individual" | "kit";

const OPTIONS = [
  {
    id: "individual" as const,
    icon: Package,
    title: "Producto individual",
    description: "Una referencia con su propio precio y stock.",
    bullets: [
      "Lo más común: una libreta, un lápiz, una cinta.",
      "Después puedes convertirlo en grupo de variantes.",
    ],
  },
  {
    id: "grupo" as const,
    icon: Layers,
    title: "Grupo con variantes",
    description: "Un mismo artículo en varios colores o tamaños.",
    bullets: [
      "Crea el grupo y sus variantes de una vez.",
      "Cada variante es un producto con SKU propio.",
    ],
  },
  {
    id: "kit" as const,
    icon: Boxes,
    title: "Kit o combo",
    description: "Se arma con productos que ya existen.",
    bullets: [
      "El costo y el stock salen de los componentes.",
      "Al venderlo se descuentan los componentes.",
    ],
  },
];

interface ProductShapePickerProps {
  storeId: string;
  value: ProductShapeChoice;
  onChange: (value: ProductShapeChoice) => void;
  disabled?: boolean;
}

/**
 * Primero la forma, después el formulario: el mismo patrón que la creación de
 * pedidos, donde el tipo decide qué campos tienen sentido.
 */
export function ProductShapePicker({
  storeId,
  value,
  onChange,
  disabled,
}: ProductShapePickerProps) {
  const router = useRouter();

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-[15px] font-bold text-primary">
        ¿Qué estás creando?
      </legend>
      <div className="grid gap-3 md:grid-cols-3">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => {
                if (option.id === "grupo") {
                  router.push(`/${storeId}/productos/nuevo-grupo`);
                  return;
                }
                onChange(option.id);
              }}
              className={cn(
                "flex flex-col gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-accent/40"
                  : "hover:border-primary/40",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold text-primary">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </div>
              <ul className="ml-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {option.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
