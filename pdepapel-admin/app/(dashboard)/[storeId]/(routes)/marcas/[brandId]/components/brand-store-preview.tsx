import Image from "next/image";

import { canShowBrandLogo, isBrandColor, type BrandLogoPermissionValue } from "@/lib/brand-rules";

interface BrandStorePreviewProps {
  name: string;
  logoUrl: string | null;
  logoPermission: BrandLogoPermissionValue;
  color: string;
}

/** «Así se verá en la tienda»: encabezado de su página y ficha del carrusel. */
export function BrandStorePreview({ name, logoUrl, logoPermission, color }: BrandStorePreviewProps) {
  const showLogo = canShowBrandLogo({ logoUrl, logoPermission });
  const label = name.trim() || "Nombre de la marca";
  const background = isBrandColor(color) ? color : "#FDE2EC";

  const mark = (size: "lg" | "sm") =>
    showLogo && logoUrl ? (
      <span
        className={
          size === "lg"
            ? "relative flex h-20 w-20 shrink-0 rounded-xl bg-white p-2 shadow-sm"
            : "relative flex h-16 w-16 shrink-0 rounded-xl border bg-white p-2"
        }
      >
        <span className="relative h-full w-full">
          <Image src={logoUrl} alt={label} fill sizes="80px" className="object-contain" />
        </span>
      </span>
    ) : (
      <span className="inline-flex max-w-full items-center rounded-full border border-[#241B41]/20 bg-white px-3 py-1 text-sm font-bold text-[#241B41]">
        {label}
      </span>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 rounded-xl p-4" style={{ backgroundColor: background }}>
        {showLogo && mark("lg")}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#241B41]">Marca original</span>
          {showLogo ? (
            <span className="truncate font-serif text-2xl font-bold text-[#241B41]">{label}</span>
          ) : (
            mark("lg")
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {mark("sm")}
        <p className="text-xs text-muted-foreground">En el carrusel «Compra por marca» y en el menú.</p>
      </div>
      {!showLogo && logoUrl && (
        <p className="text-xs text-muted-foreground">Con el permiso «Pendiente» o «Negado» la tienda muestra el nombre en vez del logo.</p>
      )}
    </div>
  );
}
