"use client";

import axios from "axios";
import { Check, Search, Sparkles, X } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconSvg, TaxonomyIcon } from "@/components/ui/taxonomy-icon";
import { useDebounce } from "@/hooks/use-debounce";
import { getErrorMessage } from "@/lib/api-errors";
import { parseIconSvgElements } from "@/lib/svg-icon";
import {
  CURATED_TAXONOMY_ICONS,
  ICON_SEARCH_LIMIT,
  searchIconNames,
  stripLeadingSymbol,
} from "@/lib/taxonomy-icons";
import { cn } from "@/lib/utils";

export interface IconPickerValue {
  /** Nombre de Lucide en kebab-case; `null` cuando se usa un icono propio o ninguno. */
  icon: string | null;
  /** Trazos saneados de un icono generado con IA; `null` cuando se usa uno de Lucide. */
  iconSvg: string | null;
}

export interface IconPickerProps {
  value: IconPickerValue;
  onChange: (next: IconPickerValue) => void;
  /** Nombre de la categoría tal como se escribe; la vista previa lo limpia. */
  name: string;
  slug?: string | null;
  storeId: string;
  disabled?: boolean;
  /** `false` cuando el panel no tiene `GEMINI_API_KEY`: la tarjeta de IA se ve pero no genera. */
  aiConfigured: boolean;
}

export const AI_NOT_CONFIGURED_MESSAGE = "La generación con IA no está configurada.";
export const ICON_PROMPT_MIN = 3;
export const ICON_PROMPT_MAX = 120;

const KNOWN_NAMES = new Set<string>(iconNames);

function IconTile({
  label,
  selected,
  disabled,
  onSelect,
  children,
  title,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="flex w-14 flex-col items-center gap-1">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={title ?? label}
        title={title ?? label}
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-lg border bg-white text-primary transition-colors",
          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          selected && "border-transparent bg-tint-mint",
        )}
      >
        {children}
        {selected && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </button>
      <span className="w-full truncate text-center text-[11px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Selector de icono de una categoría: cuadrícula curada, búsqueda visual
 * sobre todos los iconos de Lucide (en español o inglés) y una tarjeta para
 * generar un icono propio con IA que se revisa antes de usarse.
 *
 * Se carga con `next/dynamic` (`ssr: false`) porque trae el índice completo
 * de nombres de Lucide.
 */
export function IconPicker({ value, onChange, name, slug, storeId, disabled, aiConfigured }: IconPickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 150);
  const cleanName = stripLeadingSymbol(name) || "Nueva categoría";

  const results = useMemo(
    () => (debouncedQuery.trim() ? searchIconNames(debouncedQuery, iconNames, ICON_SEARCH_LIMIT) : []),
    [debouncedQuery],
  );

  const selectLucide = (icon: string) => onChange({ icon, iconSvg: null });
  const clear = () => onChange({ icon: null, iconSvg: null });
  const hasValue = Boolean(value.icon || value.iconSvg);
  const currentLabel = value.iconSvg
    ? "Icono propio (IA)"
    : value.icon
      ? (CURATED_TAXONOMY_ICONS.find((item) => item.name === value.icon)?.label ?? value.icon)
      : "Se deduce del nombre";

  return (
    <div className="flex max-w-[560px] flex-col gap-5" data-testid="icon-picker">
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3" data-testid="icon-picker-preview">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tint-lavender text-primary">
          <TaxonomyIcon icon={value.icon} iconSvg={value.iconSvg} name={name} slug={slug} className="h-6 w-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-primary">{cleanName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {currentLabel}
            {value.icon ? ` · ${value.icon}` : ""}
          </span>
        </div>
        {hasValue && (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Quitar icono
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-primary">Iconos sugeridos</p>
        <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label="Iconos sugeridos" data-testid="icon-picker-curated">
          {CURATED_TAXONOMY_ICONS.map((item) => (
            <IconTile
              key={item.name}
              label={item.label}
              title={`${item.label} (${item.name})`}
              selected={!value.iconSvg && value.icon === item.name}
              disabled={disabled}
              onSelect={() => selectLucide(item.name)}
            >
              <TaxonomyIcon icon={item.name} className="h-6 w-6" />
            </IconTile>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-xs font-semibold text-primary">
          Buscar entre todos los iconos
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={inputId}
            type="search"
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar un icono (en español o inglés)…"
            className="pl-9"
            autoComplete="off"
          />
        </div>
        {debouncedQuery.trim() && results.length === 0 && (
          <p className="text-xs text-muted-foreground" role="status">
            Sin resultados para «{debouncedQuery.trim()}». Prueba con otra palabra o en inglés.
          </p>
        )}
        {results.length > 0 && (
          <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label="Resultados de la búsqueda" data-testid="icon-picker-results">
            {results.map((iconName) => (
              <IconTile
                key={iconName}
                label={iconName}
                selected={!value.iconSvg && value.icon === iconName}
                disabled={disabled}
                onSelect={() => selectLucide(iconName)}
              >
                {KNOWN_NAMES.has(iconName) ? (
                  <DynamicIcon name={iconName as IconName} className="h-6 w-6" aria-hidden="true" fallback={() => <span className="h-6 w-6 rounded bg-muted" />} />
                ) : (
                  <TaxonomyIcon icon={iconName} className="h-6 w-6" />
                )}
              </IconTile>
            ))}
            {results.length >= ICON_SEARCH_LIMIT && (
              <p className="w-full text-xs text-muted-foreground">Se muestran los primeros {ICON_SEARCH_LIMIT}; afina la búsqueda para ver otros.</p>
            )}
          </div>
        )}
      </div>

      <AiIconCard
        storeId={storeId}
        disabled={disabled}
        configured={aiConfigured}
        selectedSvg={value.iconSvg}
        onUse={(iconSvg) => onChange({ icon: null, iconSvg })}
      />
    </div>
  );
}

interface AiIconCardProps {
  storeId: string;
  disabled?: boolean;
  configured: boolean;
  selectedSvg: string | null;
  onUse: (iconSvg: string) => void;
}

function AiIconCard({ storeId, disabled, configured: configuredProp, selectedSvg, onUse }: AiIconCardProps) {
  const promptId = useId();
  const [configured, setConfigured] = useState(configuredProp);
  const [prompt, setPrompt] = useState("");
  const [proposals, setProposals] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setConfigured(configuredProp), [configuredProp]);

  const trimmed = prompt.trim();
  const canGenerate = configured && !disabled && !generating && trimmed.length >= ICON_PROMPT_MIN && trimmed.length <= ICON_PROMPT_MAX;
  const current = proposals[index] ?? null;
  const elements = useMemo(() => parseIconSvgElements(current), [current]);

  const generate = async (append: boolean) => {
    try {
      setGenerating(true);
      setError(null);
      const { data } = await axios.post<{ proposals: string[] }>(`/api/${storeId}/types/icon-suggestions`, {
        prompt: trimmed,
        seed: append ? proposals.length + 1 : undefined,
      });
      const fresh = (data.proposals ?? []).filter((item) => parseIconSvgElements(item).length > 0);
      if (fresh.length === 0) {
        setError("La IA no devolvió un icono utilizable. Describe el objeto con otras palabras.");
        return;
      }
      const next = append ? [...proposals, ...fresh] : fresh;
      setProposals(next);
      setIndex(append ? proposals.length : 0);
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.status === 503) {
        setConfigured(false);
        return;
      }
      setError(getErrorMessage(requestError));
    } finally {
      setGenerating(false);
    }
  };

  const another = () => {
    if (index + 1 < proposals.length) {
      setIndex(index + 1);
      return;
    }
    void generate(true);
  };

  return (
    <section
      aria-labelledby={`${promptId}-titulo`}
      className="flex flex-col gap-3 rounded-xl border border-tint-lavender bg-tint-lavender/20 p-4"
      data-testid="icon-picker-ai"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 id={`${promptId}-titulo`} className="text-sm font-bold text-primary">
          Generar con IA
        </h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_96px]">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={promptId} className="text-xs font-semibold text-primary">
            Describe el icono
          </label>
          <Input
            id={promptId}
            value={prompt}
            maxLength={ICON_PROMPT_MAX}
            disabled={disabled || !configured || generating}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ej. Clip con una hoja de papel"
          />
          <p className="text-xs text-muted-foreground">
            Se genera en el estilo de Lucide (trazo de 2 px, cuadrícula de 24, un solo color) y se guarda con la categoría.
          </p>
          {!configured && (
            <p className="text-xs font-semibold text-primary" role="status">
              {AI_NOT_CONFIGURED_MESSAGE}
            </p>
          )}
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {proposals.length === 0 ? (
              <Button type="button" size="sm" disabled={!canGenerate} isLoading={generating} loadingText="Generando…" onClick={() => void generate(false)}>
                Generar
              </Button>
            ) : (
              <>
                <Button type="button" size="sm" disabled={disabled || !current || generating} onClick={() => current && onUse(current)}>
                  {selectedSvg && selectedSvg === current ? "En uso" : "Usar este"}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={!configured || disabled || generating} isLoading={generating} loadingText="Generando…" onClick={another}>
                  Otra
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={generating || disabled || !canGenerate} onClick={() => void generate(false)}>
                  Volver a generar
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Se revisa antes de usarla; nunca se asigna sola.</p>
        </div>
        <div className="flex flex-col items-center gap-1 sm:items-end">
          <div
            className="flex h-24 w-24 items-center justify-center rounded-xl border bg-white text-primary"
            data-testid="icon-picker-ai-preview"
            aria-live="polite"
          >
            {elements.length > 0 ? (
              <IconSvg elements={elements} className="h-12 w-12" title="Vista previa de la propuesta" />
            ) : (
              <Sparkles className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {proposals.length > 0 ? `Propuesta ${index + 1} de ${proposals.length}` : "Vista previa"}
          </span>
        </div>
      </div>
    </section>
  );
}

export default IconPicker;
