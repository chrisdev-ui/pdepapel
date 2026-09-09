"use client";

import Link from "next/link";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RichTextDisplay } from "@/components/ui/rich-text-display";
import { DELIVERY_WINDOW } from "@/components/product-signals";
import { getCustomerFacingProductOptions, getStructuredProductSize } from "@/lib/product-options";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { currencyFormatter } from "@/lib/utils";
import { useStorefrontSettings } from "@/providers/storefront-settings-provider";
import { Product } from "@/types";

interface ProductDetailsAccordionProps {
  product: Product;
}

const TRIGGER = "py-4 font-sans text-base font-bold text-blue-yankees hover:no-underline";

/** Descripción, detalles y envíos en acordeón; la descripción abre por defecto. */
export function ProductDetailsAccordion({ product }: ProductDetailsAccordionProps) {
  const { freeShippingThreshold } = useStorefrontSettings();
  const size = getStructuredProductSize(product);
  const details: { label: string; value: string }[] = [
    ...(product.sku ? [{ label: "Referencia", value: product.sku }] : []),
    ...(product.brand || product.productGroup?.brand ? [{ label: "Marca", value: (product.brand || product.productGroup?.brand) as string }] : []),
    ...(product.category?.name ? [{ label: "Categoría", value: product.category.name }] : []),
    ...(product.design?.name ? [{ label: "Diseño", value: product.design.name }] : []),
    ...(product.color?.name ? [{ label: "Color", value: product.color.name }] : []),
    ...(size ? [{ label: "Tamaño", value: size }] : []),
    ...getCustomerFacingProductOptions(product).map((option) => ({ label: option.name, value: option.value })),
    ...(product.isKit && product.kitComponents?.length ? [{ label: "Kit", value: `${product.kitComponents.length} piezas` }] : []),
  ];

  return (
    <Accordion type="multiple" defaultValue={["descripcion"]} className="border-t border-border">
      <AccordionItem value="descripcion">
        <AccordionTrigger className={TRIGGER}>
          <h2 className="font-sans text-base font-bold">Descripción</h2>
        </AccordionTrigger>
        <AccordionContent>
          <RichTextDisplay content={product.description} fallback="Pronto agregaremos la descripción de este producto." />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="detalles">
        <AccordionTrigger className={TRIGGER}>
          <h2 className="font-sans text-base font-bold">Detalles y medidas</h2>
        </AccordionTrigger>
        <AccordionContent>
          {details.length > 0 ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 font-sans text-sm">
              {details.map((detail) => (
                <div key={detail.label} className="contents">
                  <dt className="text-gray-500">{detail.label}</dt>
                  <dd className="text-blue-yankees">{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="font-sans text-sm text-gray-500">Las medidas exactas están en la descripción.</p>
          )}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="envios">
        <AccordionTrigger className={TRIGGER}>
          <h2 className="font-sans text-base font-bold">Envíos y cambios</h2>
        </AccordionTrigger>
        <AccordionContent>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 font-sans text-sm text-blue-yankees">
            <li>Enviamos a toda Colombia con transportadora; llega en {DELIVERY_WINDOW} después del pago.</li>
            {freeShippingThreshold ? <li>Envío gratis en pedidos desde {currencyFormatter.format(freeShippingThreshold)}.</li> : null}
            <li>Pago en línea o transferencia bancaria; el pedido se despacha cuando el pago se confirma.</li>
            <li>Cambios hasta 5 días calendario después de la compra, con el producto sin uso y en su empaque.</li>
          </ul>
          <p className="mt-3 font-sans text-sm">
            <Link href={STOREFRONT_ROUTES.shippingPolicy} className="font-semibold underline underline-offset-2">
              Política de envíos
            </Link>{" "}
            ·{" "}
            <Link href={STOREFRONT_ROUTES.returnsPolicy} className="font-semibold underline underline-offset-2">
              Cambios y devoluciones
            </Link>
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
