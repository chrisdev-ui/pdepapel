"use client";

import axios from "axios";
import { Check, ChevronsUpDown, Minus, Plus, Search, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { buildBrandMatcher, singleBrandMatch, type BrandMatch } from "@/lib/brand-matcher";
import type { BrandOption } from "@/lib/brand-options";
import { brandKey } from "@/lib/brand-rules";
import type { ProductImageBrandSource } from "@/lib/product-image-analysis";
import { cn } from "@/lib/utils";

export type { BrandOption };

const PHONE_QUERY = "(max-width: 640px)";

function usePhoneLayout() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return phone;
}

/** Logo pequeño junto al nombre (alt vacío: el nombre ya está al lado). */
export function BrandLogoCell({ brand, className }: { brand: Pick<BrandOption, "logoUrl"> | null; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white",
        className,
      )}
    >
      {brand?.logoUrl ? (
        <Image src={brand.logoUrl} alt="" width={40} height={32} className="h-full w-full object-contain p-0.5" />
      ) : brand ? (
        <span className="px-0.5 text-center text-[9px] font-medium leading-tight text-muted-foreground">Sin logo</span>
      ) : (
        <Minus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

function matchesQuery(brand: BrandOption, query: string) {
  const key = brandKey(query);
  if (!key) return true;
  return [brand.name, ...brand.aliases].some((term) => brandKey(term).includes(key));
}

interface BrandPickerProps {
  storeId: string;
  brands: BrandOption[];
  value: string | null;
  onChange: (brandId: string | null) => void;
  disabled?: boolean;
  id?: string;
  /** «+ Crear marca»: crea la marca solo con el nombre y la deja elegida. */
  allowCreate?: boolean;
  /** Avisa de una marca creada aquí, para que el formulario la conozca (nombre, sugerencias). */
  onBrandCreated?: (brand: BrandOption) => void;
  "aria-describedby"?: string;
}

/**
 * Selector de marca: lista con búsqueda (nombre o alias) en computador y hoja
 * inferior con casillas de radio en el celular. Incluye «Sin marca» y crear una
 * marca nueva sin salir del formulario.
 */
export function BrandPicker({
  storeId,
  brands,
  value,
  onChange,
  disabled,
  id,
  allowCreate = true,
  onBrandCreated,
  "aria-describedby": describedBy,
}: BrandPickerProps) {
  const phone = usePhoneLayout();
  const { toast } = useToast();
  const radioName = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [created, setCreated] = useState<BrandOption[]>([]);
  const [newName, setNewName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => {
    const byId = new Map<string, BrandOption>();
    for (const brand of [...brands, ...created]) byId.set(brand.id, brand);
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [brands, created]);
  const selected = value ? options.find((brand) => brand.id === value) ?? null : null;
  const visible = options.filter((brand) => matchesQuery(brand, query));

  const close = () => {
    setOpen(false);
    setQuery("");
    setNewName(null);
  };
  const choose = (brandId: string | null) => {
    onChange(brandId);
    close();
  };

  const createBrand = async () => {
    const name = (newName ?? "").trim();
    if (!name) return;
    try {
      setSaving(true);
      const { data } = await axios.post<BrandOption & { aliases: unknown }>(`/api/${storeId}/brands`, { name });
      const brand: BrandOption = {
        id: data.id,
        name: data.name,
        logoUrl: data.logoUrl ?? null,
        logoPermission: data.logoPermission ?? "UNKNOWN",
        aliases: [],
        isArchived: false,
      };
      setCreated((current) => [...current, brand]);
      onBrandCreated?.(brand);
      toast({ description: `Marca «${brand.name}» creada. El logo y los alias se agregan en Marcas.`, variant: "success" });
      choose(brand.id);
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => setOpen(true)}
      className={cn("h-11 w-full justify-between bg-white px-3 font-normal", !value && "text-muted-foreground")}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {selected && <BrandLogoCell brand={selected} className="h-7 w-9" />}
        <span className="min-w-0 flex-1 truncate">
          {selected
            ? `${selected.name}${selected.isArchived ? " · archivada" : ""}`
            : value
              ? "Marca no disponible"
              : "Elige la marca"}
        </span>
      </span>
      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
    </Button>
  );

  const createForm = newName !== null && (
    <form
      className="flex flex-col gap-2 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void createBrand();
      }}
    >
      <label htmlFor={`${radioName}-new`} className="text-sm font-medium">
        Nombre de la marca nueva
      </label>
      <Input
        id={`${radioName}-new`}
        autoFocus
        value={newName}
        maxLength={120}
        onChange={(event) => setNewName(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder="Ej. Kiut"
      />
      <p className="text-xs text-muted-foreground">Se crea solo con el nombre; el logo y los alias se agregan en Marcas.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setNewName(null)} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || !newName.trim()}>
          {saving ? "Creando…" : "Crear y elegir"}
        </Button>
      </div>
    </form>
  );

  if (phone) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
          <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-2xl p-0">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-lg">Marca</SheetTitle>
              <SheetDescription className="sr-only">Elige la marca del producto, «Sin marca» o crea una nueva.</SheetDescription>
            </SheetHeader>
            {createForm || (
              <>
                <div className="relative px-4 pb-2">
                  <Search className="pointer-events-none absolute left-7 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar marca o alias"
                    aria-label="Buscar marca o alias"
                    className="h-11 pl-9"
                  />
                </div>
                <fieldset className="flex flex-col overflow-y-auto">
                  <legend className="sr-only">Marca</legend>
                  {visible.map((brand) => (
                    <label
                      key={brand.id}
                      className="flex min-h-14 cursor-pointer items-center gap-3 border-b px-4 py-2 has-[:focus-visible]:bg-accent"
                    >
                      <BrandLogoCell brand={brand} className="h-10 w-14" />
                      <span className="min-w-0 flex-1 truncate">
                        {brand.name}
                        {brand.aliases.length > 0 && (
                          <span className="text-sm text-muted-foreground"> · {brand.aliases.slice(0, 2).join(", ")}</span>
                        )}
                        {brand.isArchived && <span className="text-sm text-muted-foreground"> · archivada</span>}
                      </span>
                      <input
                        type="radio"
                        name={radioName}
                        className="h-5 w-5 accent-primary"
                        checked={value === brand.id}
                        onChange={() => choose(brand.id)}
                      />
                    </label>
                  ))}
                  {visible.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Ninguna marca coincide con «{query.trim()}».</p>
                  )}
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b px-4 py-2 has-[:focus-visible]:bg-accent">
                    <BrandLogoCell brand={null} className="h-10 w-14" />
                    <span className="min-w-0 flex-1">
                      Sin marca <span className="text-sm text-muted-foreground">(genérico o hecho a mano)</span>
                    </span>
                    <input
                      type="radio"
                      name={radioName}
                      className="h-5 w-5 accent-primary"
                      checked={!value}
                      onChange={() => choose(null)}
                    />
                  </label>
                </fieldset>
                {allowCreate && (
                  <button
                    type="button"
                    className="flex min-h-14 items-center gap-3 border-b px-4 py-2 text-left font-semibold text-primary focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => setNewName(query.trim())}
                  >
                    <span className="flex h-10 w-14 items-center justify-center rounded-md border bg-white">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {query.trim() ? `Crear «${query.trim()}»` : "Crear marca nueva"}
                  </button>
                )}
                <div className="h-4 shrink-0" aria-hidden="true" />
              </>
            )}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
        {createForm || (
          <Command shouldFilter={false}>
            <CommandInput placeholder="Buscar marca o alias…" value={query} onValueChange={setQuery} />
            <CommandList className="max-h-72">
              {visible.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {options.length === 0 ? "Aún no hay marcas." : `Ninguna marca coincide con «${query.trim()}».`}
                </p>
              )}
              {visible.length > 0 && (
                <CommandGroup>
                  {visible.map((brand) => (
                    <CommandItem key={brand.id} value={brand.id} onSelect={() => choose(brand.id)} className="min-h-11 gap-3">
                      <BrandLogoCell brand={brand} />
                      <span className="min-w-0 flex-1 truncate">
                        {brand.name}
                        {brand.aliases.length > 0 && (
                          <span className="text-xs text-muted-foreground"> · {brand.aliases.slice(0, 2).join(", ")}</span>
                        )}
                        {brand.isArchived && <span className="text-xs text-muted-foreground"> · archivada</span>}
                      </span>
                      <Check
                        className={cn("h-4 w-4 shrink-0", value === brand.id ? "opacity-100" : "opacity-0")}
                        aria-hidden="true"
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value="__sin-marca__" onSelect={() => choose(null)} className="min-h-11 gap-3">
                  <BrandLogoCell brand={null} />
                  <span className="flex-1">
                    Sin marca <span className="text-xs text-muted-foreground">(genérico o hecho a mano)</span>
                  </span>
                  <Check className={cn("h-4 w-4 shrink-0", !value ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                </CommandItem>
                {allowCreate && (
                  <CommandItem
                    value="__crear-marca__"
                    onSelect={() => setNewName(query.trim())}
                    className="min-h-11 gap-3 font-semibold text-primary"
                  >
                    <span className="flex h-8 w-10 items-center justify-center rounded-md border bg-white">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {query.trim() ? `Crear «${query.trim()}»` : "Crear marca nueva"}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Variante de un grupo: la marca se ve, pero se cambia en el grupo. */
export function BrandFromGroup({ brand, id }: { brand: Pick<BrandOption, "name" | "logoUrl"> | null; id?: string }) {
  return (
    <div
      id={id}
      className="flex h-11 w-full items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 text-sm"
      aria-readonly="true"
    >
      {brand && <BrandLogoCell brand={brand} className="h-7 w-9" />}
      <span className="min-w-0 flex-1 truncate">
        {brand ? brand.name : "Sin marca"} <span className="text-muted-foreground">· viene del grupo</span>
      </span>
    </div>
  );
}

export interface AiBrandSuggestion {
  brandId: string | null;
  /** Lo que leyó la IA (o el nombre de la marca encontrada). */
  brandName: string;
  brandSource: ProductImageBrandSource;
}

/** La única marca que nombra el texto, o null si no nombra ninguna o nombra varias. */
export function suggestBrandFromName(name: string | null | undefined, brands: BrandOption[]): BrandMatch | null {
  return singleBrandMatch(buildBrandMatcher(brands)(name));
}

/**
 * Una sola sugerencia bajo el campo Marca: la de la IA si la hay, si no la que
 * sale del nombre del producto (solo con el campo vacío). Nada se aplica sin «Usar».
 */
export function BrandSuggestion({
  productName,
  brands,
  value,
  aiSuggestion,
  onUse,
  onDismissAi,
  disabled,
}: {
  productName: string | null | undefined;
  brands: BrandOption[];
  value: string | null;
  aiSuggestion?: AiBrandSuggestion | null;
  onUse: (brandId: string) => void;
  onDismissAi?: () => void;
  disabled?: boolean;
}) {
  const fromName = useMemo(
    () => (value ? null : suggestBrandFromName(productName, brands.filter((brand) => !brand.isArchived))),
    [productName, brands, value],
  );

  if (aiSuggestion && (!aiSuggestion.brandId || aiSuggestion.brandId !== value)) {
    const found = aiSuggestion.brandSource === "existing" && aiSuggestion.brandId;
    return (
      <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-tint-lavender bg-tint-lavender/30 px-3 py-2 text-sm">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {found ? (
            <>
              Marca sugerida por la IA: <strong>{aiSuggestion.brandName}</strong>
            </>
          ) : (
            <>
              La IA leyó «<strong>{aiSuggestion.brandName}</strong>», que no está en tus marcas. Si es correcta, créala desde
              «Marca».
            </>
          )}
        </span>
        {found && (
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => onUse(aiSuggestion.brandId!)}>
            Usar
          </Button>
        )}
        {onDismissAi && (
          <Button type="button" size="icon" variant="ghost" className="h-11 w-11" aria-label="Descartar la sugerencia de la IA" onClick={onDismissAi}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  }

  if (!fromName) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        El nombre dice <strong>«{fromName.term}»</strong>. ¿Es de la marca <strong>{fromName.brandName}</strong>?
        {fromName.via === "alias" && <span className="text-muted-foreground"> (por el alias «{fromName.term}»)</span>}
      </span>
      <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => onUse(fromName.brandId)}>
        Usar {fromName.brandName}
      </Button>
    </div>
  );
}
