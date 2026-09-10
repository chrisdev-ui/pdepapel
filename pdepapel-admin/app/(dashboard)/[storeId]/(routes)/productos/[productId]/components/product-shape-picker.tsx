"use client";

import { RadioCards } from "@/components/ui/radio-cards";
import { Boxes, Layers, Package } from "lucide-react";
import { useRouter } from "next/navigation";

export type ProductShapeChoice = "individual" | "kit";
type ShapeOption = ProductShapeChoice | "grupo";

const OPTIONS: {
  value: ShapeOption;
  icon: typeof Package;
  title: string;
  hint: string;
  bullets: string[];
}[] = [
  {
    value: "individual",
    icon: Package,
    title: "Producto individual",
    hint: "Una referencia con su propio precio y stock.",
    bullets: [
      "Lo más común: una libreta, un lápiz, una cinta.",
      "Después puedes convertirlo en grupo de variantes.",
    ],
  },
  {
    value: "grupo",
    icon: Layers,
    title: "Grupo con variantes",
    hint: "Un mismo artículo en varios colores o tamaños.",
    bullets: [
      "Crea el grupo y sus variantes de una vez.",
      "Cada variante es un producto con SKU propio.",
    ],
  },
  {
    value: "kit",
    icon: Boxes,
    title: "Kit o combo",
    hint: "Se arma con productos que ya existen.",
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
 * pedidos, donde el tipo decide qué campos tienen sentido. «Grupo» lleva a su
 * propio formulario.
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
      <RadioCards<ShapeOption>
        value={value}
        disabled={disabled}
        label="Forma del producto"
        idPrefix="forma"
        onChange={(next) => {
          if (next === "grupo") {
            router.push(`/${storeId}/productos/nuevo-grupo`);
            return;
          }
          onChange(next);
        }}
        options={OPTIONS.map((option) => {
          const Icon = option.icon;
          return {
            value: option.value,
            title: option.title,
            hint: option.hint,
            bullets: option.bullets,
            icon: (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
            ),
          };
        })}
      />
    </fieldset>
  );
}
