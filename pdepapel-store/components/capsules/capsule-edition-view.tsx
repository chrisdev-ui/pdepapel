"use client";

import { Gift, Package, Sparkles, Ticket, Video } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { dayMessage } from "@/lib/capsule-copy";
import { cn, currencyFormatter } from "@/lib/utils";
import type { CapsuleEditionPublic } from "@/types/capsules";

const CONSENT_OPTIONS = [
  { value: "PRIVATE", label: "No, el video de mi apertura es solo para mí" },
  { value: "PUBLIC_FIRST_NAME", label: "Sí, pueden publicar mi video diciendo solo mi primer nombre" },
] as const;

/**
 * La página de una edición: qué es, «Lo que puede salir» (sin precios), el
 * pack, los cupos del día, el permiso para el video y la caja del envío. La
 * compra se abre en el lanzamiento (P4): hasta entonces el botón dice «Muy
 * pronto».
 */
export function CapsuleEditionView({ data }: { data: CapsuleEditionPublic }) {
  const firstAvailable = data.packs.find((pack) => pack.available)?.packSize ?? null;
  const [packSize, setPackSize] = useState<number | null>(firstAvailable);
  const [consent, setConsent] = useState<string>("PRIVATE");
  const selected = data.packs.find((pack) => pack.packSize === packSize) ?? null;
  const day = dayMessage(data.day);
  const cover = data.product.images[0] ?? null;

  return (
    <div className="flex flex-col gap-8">
      {data.preview && (
        <p role="status" className="rounded-lg border border-blue-baby bg-kawaii-lavender px-4 py-3 text-sm text-blue-yankees">
          Vista previa: esta página todavía no está publicada y la compra está apagada.
        </p>
      )}

      <section className="grid gap-6 md:grid-cols-2 md:items-center" aria-labelledby="capsulas-titulo">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-pink-shell">
          {cover ? (
            <CloudinaryImage src={cover} alt={data.product.name} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" priority />
          ) : (
            <div className="flex h-full items-center justify-center text-blue-yankees">
              <Sparkles className="h-16 w-16" aria-hidden />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-wide text-blue-yankees/80">Cápsulas sorpresa · Edición #{data.edition.number}</p>
          <h1 id="capsulas-titulo" className="text-3xl font-bold text-blue-yankees">
            {data.edition.name}
          </h1>
          <p className="flex items-center gap-2 text-lg font-semibold text-blue-yankees">
            <Sparkles className="h-5 w-5 text-yellow-star" aria-hidden />1 cápsula = 1 producto sorpresa
          </p>
          <p className="text-base text-muted-foreground">
            Cada cápsula trae un papelito con un producto de la colección {data.edition.name}. Abrimos tus cápsulas para ti, te contamos qué salió y te lo enviamos todo junto en una cajita.
          </p>
        </div>
      </section>

      <section aria-labelledby="puede-salir" className="flex flex-col gap-3">
        <h2 id="puede-salir" className="text-2xl font-semibold text-blue-yankees">
          Lo que puede salir
        </h2>
        {data.gallery.length === 0 ? (
          <p className="text-muted-foreground">Muy pronto te mostramos los productos de esta edición.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.gallery.map((item) => (
              <li key={item.name} className="flex flex-col gap-2 rounded-xl border border-blue-baby bg-white p-2">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-pink-shell">
                  {item.imageUrl ? (
                    <CloudinaryImage src={item.imageUrl} alt={item.name} fill sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-blue-yankees">
                      <Gift className="h-8 w-8" aria-hidden />
                    </div>
                  )}
                </div>
                <span className="line-clamp-2 text-sm text-blue-yankees">{item.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="elige-pack" className="flex flex-col gap-3">
        <h2 id="elige-pack" className="text-2xl font-semibold text-blue-yankees">
          Elige tu pack
        </h2>
        <RadioGroup value={packSize === null ? "" : String(packSize)} onValueChange={(value) => setPackSize(Number(value))} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Packs de cápsulas">
          {data.packs.map((pack) => {
            const id = `pack-${pack.packSize}`;
            return (
              <label
                key={pack.packSize}
                htmlFor={id}
                className={cn(
                  "flex min-h-[44px] cursor-pointer gap-3 rounded-xl border-2 bg-white p-4 transition-colors",
                  pack.available ? "border-blue-baby hover:border-blue-yankees" : "cursor-not-allowed border-dashed border-blue-baby opacity-60",
                  packSize === pack.packSize && "border-blue-yankees bg-kawaii-lavender",
                )}
              >
                <RadioGroupItem id={id} value={String(pack.packSize)} disabled={!pack.available} className="mt-1" />
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-semibold text-blue-yankees">Pack de {pack.packSize}</span>
                  <span className="text-blue-yankees">{currencyFormatter.format(pack.total)}</span>
                  <span className="text-sm text-muted-foreground">{currencyFormatter.format(pack.unitPrice)} por cápsula</span>
                  {pack.saving > 0 && <span className="text-sm font-medium text-blue-yankees">Ahorras {currencyFormatter.format(pack.saving)}</span>}
                  {pack.giftLabel && (
                    <span className="flex items-center gap-1 text-sm text-blue-yankees">
                      <Gift className="h-4 w-4" aria-hidden />+ {pack.giftLabel}
                    </span>
                  )}
                  {!pack.available && <span className="text-sm font-medium text-blue-yankees">No disponible en esta edición</span>}
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </section>

      <section aria-labelledby="cupos" className="flex flex-col gap-1 rounded-xl border border-blue-baby bg-white p-4" data-testid="cupos-del-dia">
        <h2 id="cupos" className="flex items-center gap-2 text-lg font-semibold text-blue-yankees">
          <Ticket className="h-5 w-5" aria-hidden />
          {day.headline}
        </h2>
        {day.detail && <p className="text-blue-yankees">{day.detail}</p>}
        <p className="text-sm text-muted-foreground">Abrimos pocos pedidos por día para abrir cada uno con calma.</p>
      </section>

      <section aria-labelledby="video" className="flex flex-col gap-3">
        <h2 id="video" className="flex items-center gap-2 text-lg font-semibold text-blue-yankees">
          <Video className="h-5 w-5" aria-hidden />
          ¿Podemos compartir el video de tu apertura?
        </h2>
        <RadioGroup value={consent} onValueChange={setConsent} className="flex flex-col gap-2" aria-label="Permiso para el video">
          {CONSENT_OPTIONS.map((option) => (
            <label key={option.value} htmlFor={`video-${option.value}`} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-blue-baby bg-white px-3 py-2">
              <RadioGroupItem id={`video-${option.value}`} value={option.value} />
              <span className="text-blue-yankees">{option.label}</span>
            </label>
          ))}
        </RadioGroup>
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-pink-shell p-4" aria-labelledby="resumen-pack">
        <h2 id="resumen-pack" className="sr-only">
          Resumen
        </h2>
        {selected ? (
          <p className="flex items-center gap-2 text-blue-yankees">
            <Package className="h-5 w-5" aria-hidden />
            Tu pack de {selected.packSize} viaja en una caja {selected.boxType}; el envío se calcula al finalizar la compra con esa caja.
          </p>
        ) : (
          <p className="text-blue-yankees">Por ahora no hay packs disponibles en esta edición.</p>
        )}
        <Button className="min-h-[44px] w-full sm:w-auto" disabled aria-describedby="compra-pronto">
          Muy pronto
        </Button>
        <p id="compra-pronto" className="text-sm text-muted-foreground">
          La compra de cápsulas se abre en el lanzamiento.
        </p>
      </section>
    </div>
  );
}
