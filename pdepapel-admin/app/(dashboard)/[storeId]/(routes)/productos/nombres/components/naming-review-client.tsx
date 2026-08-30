"use client";

import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_RECOMMENDED_MAX_LENGTH,
  buildProductNameSuggestion,
} from "@/lib/product-naming";
import axios from "axios";
import {
  Check,
  ExternalLink,
  ImageOff,
  ListFilter,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Undo2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

type ProductCandidate = {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  categoryName: string;
  colorName: string;
  sizeName: string;
  sizeValue: string;
  designName: string;
  groupName: string | null;
  imageUrl: string | null;
};

type GroupCandidate = {
  id: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  imageUrl: string | null;
};

type RecentChange = {
  id: string;
  entityType: "PRODUCT" | "PRODUCT_GROUP";
  previousName: string;
  nextName: string;
  createdAt: string;
  revertedAt: string | null;
};

type NamingReviewClientProps = {
  products: ProductCandidate[];
  groups: GroupCandidate[];
  recentChanges: RecentChange[];
};

type EntityType = "PRODUCT" | "PRODUCT_GROUP";
type ReviewFilter = "ALL" | "SUGGESTED" | "LONG" | "UNCHANGED";

const PAGE_SIZE = 20;
const MAX_BATCH_SIZE = 25;

function entityKey(entityType: EntityType, id: string) {
  return `${entityType}:${id}`;
}

export function NamingReviewClient({
  products,
  groups,
  recentChanges,
}: NamingReviewClientProps) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<EntityType>("PRODUCT");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [proposalFeedback, setProposalFeedback] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rollbackId, setRollbackId] = useState<string | null>(null);

  const suggestionFor = useCallback(
    (candidate: ProductCandidate | GroupCandidate) => {
      const isProduct = entityType === "PRODUCT";
      return buildProductNameSuggestion({
        baseName: candidate.name,
        categoryName: candidate.categoryName,
        brand: candidate.brand,
        designName: isProduct
          ? (candidate as ProductCandidate).designName
          : null,
        colorName: isProduct ? (candidate as ProductCandidate).colorName : null,
        sizeName: isProduct ? (candidate as ProductCandidate).sizeName : null,
        sizeValue: isProduct ? (candidate as ProductCandidate).sizeValue : null,
        includeVariantAttributes: isProduct,
      });
    },
    [entityType],
  );

  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-CO");
    const source = entityType === "PRODUCT" ? products : groups;

    return source.filter((candidate) => {
      const text = [
        candidate.name,
        candidate.brand,
        candidate.categoryName,
        ...(entityType === "PRODUCT"
          ? [
              (candidate as ProductCandidate).sku,
              (candidate as ProductCandidate).designName,
              (candidate as ProductCandidate).colorName,
              (candidate as ProductCandidate).groupName,
            ]
          : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es-CO");
      if (normalizedQuery && !text.includes(normalizedQuery)) return false;

      const suggestion = suggestionFor(candidate);
      if (reviewFilter === "SUGGESTED") {
        return Boolean(suggestion.name && suggestion.name !== candidate.name);
      }
      if (reviewFilter === "LONG") {
        return candidate.name.length > PRODUCT_NAME_RECOMMENDED_MAX_LENGTH;
      }
      if (reviewFilter === "UNCHANGED") {
        return suggestion.name === candidate.name;
      }
      return true;
    });
  }, [entityType, groups, products, query, reviewFilter, suggestionFor]);

  const pageCount = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleCandidates = candidates.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const selectedChanges = useMemo(() => {
    const source = entityType === "PRODUCT" ? products : groups;
    return source.flatMap((candidate) => {
      const key = entityKey(entityType, candidate.id);
      const name = drafts[key];
      if (!selected[key] || !name || name === candidate.name) return [];
      return [{ entityType, entityId: candidate.id, name }];
    });
  }, [drafts, entityType, groups, products, selected]);

  const selectedCount = selectedChanges.length;

  const reviewStats = useMemo(() => {
    const source = entityType === "PRODUCT" ? products : groups;
    return source.reduce(
      (stats, candidate) => {
        const suggestion = suggestionFor(candidate);
        if (suggestion.name && suggestion.name !== candidate.name) {
          stats.withSuggestion += 1;
        }
        if (candidate.name.length > PRODUCT_NAME_RECOMMENDED_MAX_LENGTH) {
          stats.longNames += 1;
        }
        if (suggestion.name === candidate.name) stats.unchanged += 1;
        return stats;
      },
      { withSuggestion: 0, longNames: 0, unchanged: 0 },
    );
  }, [entityType, groups, products, suggestionFor]);

  const updateSuggestion = (candidate: ProductCandidate | GroupCandidate) => {
    const key = entityKey(entityType, candidate.id);
    const suggestion = suggestionFor(candidate);

    if (suggestion.name === candidate.name) {
      setSelected((current) => ({ ...current, [key]: false }));
      setProposalFeedback((current) => ({
        ...current,
        [key]:
          "La propuesta segura coincide con el nombre actual. Edita solo si puedes confirmar un detalle del empaque.",
      }));
      return;
    }

    setDrafts((current) => ({ ...current, [key]: suggestion.name }));
    setSelected((current) => ({ ...current, [key]: true }));
    setProposalFeedback((current) => ({
      ...current,
      [key]: "Propuesta lista para revisar antes de aplicarla.",
    }));
  };

  const prepareVisibleSuggestions = () => {
    const candidatesToPrepare = visibleCandidates.filter((candidate) => {
      const key = entityKey(entityType, candidate.id);
      const suggestion = suggestionFor(candidate);
      return (
        !drafts[key] &&
        Boolean(suggestion.name && suggestion.name !== candidate.name)
      );
    });

    if (candidatesToPrepare.length === 0) {
      toast({
        description:
          "No hay propuestas nuevas y seguras en esta página. Puedes revisar los nombres sin cambios o editar uno manualmente.",
      });
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      candidatesToPrepare.forEach((candidate) => {
        next[entityKey(entityType, candidate.id)] =
          suggestionFor(candidate).name;
      });
      return next;
    });
    setSelected((current) => {
      const next = { ...current };
      candidatesToPrepare.forEach((candidate) => {
        const key = entityKey(entityType, candidate.id);
        next[key] = true;
      });
      return next;
    });
    toast({
      description: `${candidatesToPrepare.length} propuesta${candidatesToPrepare.length === 1 ? "" : "s"} preparada${candidatesToPrepare.length === 1 ? "" : "s"} para revisión. Aún no se aplicó ningún cambio.`,
      variant: "success",
    });
  };

  const updateDraft = (id: string, name: string) => {
    const key = entityKey(entityType, id);
    setDrafts((current) => ({ ...current, [key]: name }));
    setSelected((current) => ({ ...current, [key]: true }));
    setProposalFeedback((current) => {
      const { [key]: _, ...remainingFeedback } = current;
      return remainingFeedback;
    });
  };

  const applyNames = async () => {
    try {
      setLoading(true);
      const response = await axios.post(
        `/api/${params.storeId}/products/naming`,
        { changes: selectedChanges },
      );
      toast({
        title: "Nombres actualizados",
        description: response.data.message,
        variant: "success",
      });
      setDrafts({});
      setSelected({});
      setProposalFeedback({});
      setConfirmOpen(false);
      router.refresh();
    } catch (error) {
      toast({
        title: "No se actualizaron los nombres",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const rollback = async () => {
    if (!rollbackId) return;
    try {
      setLoading(true);
      const response = await axios.patch(
        `/api/${params.storeId}/products/naming`,
        { changeIds: [rollbackId] },
      );
      const skipped = response.data.skipped?.[0];
      toast({
        title: skipped ? "No se revirtió el nombre" : "Nombre restaurado",
        description:
          skipped?.reason ||
          "Se recuperó el nombre anterior sin modificar URL, stock ni precio.",
        variant: skipped ? "destructive" : "success",
      });
      setRollbackId(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo restaurar el nombre",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal
        title="Aplicar nombres revisados"
        description={`Se actualizarán únicamente ${selectedCount} nombre${selectedCount === 1 ? "" : "s"}. Las URLs, inventario, precios y publicaciones no cambiarán.`}
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      >
        <p className="text-sm text-muted-foreground">
          Podrás revertir cada cambio desde el historial mientras nadie haya
          editado ese nombre después.
        </p>
        <div className="flex flex-col-reverse gap-2 pt-6 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => setConfirmOpen(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={loading} onClick={applyNames}>
            Aplicar {selectedCount} nombre{selectedCount === 1 ? "" : "s"}
          </Button>
        </div>
      </Modal>
      <Modal
        title="Revertir nombre"
        description="Se recuperará el nombre anterior sin modificar la URL ni ningún dato operativo."
        isOpen={Boolean(rollbackId)}
        onClose={() => setRollbackId(null)}
      >
        <div className="flex flex-col-reverse gap-2 pt-6 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => setRollbackId(null)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={loading} onClick={rollback}>
            Revertir nombre
          </Button>
        </div>
      </Modal>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <Heading
          title="Nombres para búsqueda"
          description="Prepara títulos claros para la tienda, Google y Merchant Center sin cambiar las URLs existentes."
        />
        <Button
          type="button"
          disabled={
            selectedCount === 0 || selectedCount > MAX_BATCH_SIZE || loading
          }
          onClick={() => setConfirmOpen(true)}
        >
          <Check className="mr-2 h-4 w-4" />
          Aplicar {selectedCount || ""} nombre{selectedCount === 1 ? "" : "s"}
        </Button>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium">Flujo seguro</p>
        <p className="mt-1 text-muted-foreground">
          Revisa y selecciona máximo {MAX_BATCH_SIZE} propuestas por vez. Este
          módulo modifica únicamente el nombre y guarda un historial para
          revertirlo; no toca slug, inventario, precios, fotos, pedidos ni
          publicaciones de Mercado Libre.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Tamaños claros, códigos internos aparte</p>
          <p className="mt-1 text-muted-foreground">
            Los códigos S, S+, M-P y similares sirven para envío y SKU; no se
            añaden a los nombres ni se muestran como filtros para clientes.
          </p>
        </div>
        <Button asChild type="button" variant="outline" className="shrink-0">
          <Link href={`/${params.storeId}/productos/opciones`}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Revisar opciones
          </Link>
        </Button>
      </div>

      <Tabs
        value={entityType}
        onValueChange={(value) => {
          setEntityType(value as EntityType);
          setPage(0);
          setReviewFilter("ALL");
          setSelected({});
          setProposalFeedback({});
        }}
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="PRODUCT">
            Productos ({products.length})
          </TabsTrigger>
          <TabsTrigger value="PRODUCT_GROUP">
            Grupos ({groups.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xl">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            className="pl-9"
            placeholder="Buscar por nombre, SKU, categoría, diseño o color"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={reviewFilter}
            onValueChange={(value) => {
              setReviewFilter(value as ReviewFilter);
              setPage(0);
            }}
          >
            <SelectTrigger
              aria-label="Priorizar revisión de nombres"
              className="w-full sm:w-56"
            >
              <SelectValue placeholder="Priorizar revisión" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="SUGGESTED">Con propuesta segura</SelectItem>
              <SelectItem value="LONG">Nombres largos</SelectItem>
              <SelectItem value="UNCHANGED">Sin cambio sugerido</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {candidates.length} resultado{candidates.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Con propuesta segura</p>
          <p className="mt-1 text-2xl font-semibold">
            {reviewStats.withSuggestion}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Sobre 65 caracteres</p>
          <p className="mt-1 text-2xl font-semibold">{reviewStats.longNames}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Sin cambio automático</p>
          <p className="mt-1 text-2xl font-semibold">{reviewStats.unchanged}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Prepara las propuestas seguras de esta página para revisarlas juntas.
          No modifica ningún producto todavía.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={loading || visibleCandidates.length === 0}
          onClick={prepareVisibleSuggestions}
        >
          <ListFilter className="mr-2 h-4 w-4" />
          Preparar visibles
        </Button>
      </div>

      <Separator />

      <div className="space-y-3">
        {visibleCandidates.map((candidate) => {
          const key = entityKey(entityType, candidate.id);
          const suggestion = suggestionFor(candidate);
          const draft = drafts[key] ?? candidate.name;
          const selectedForApply = Boolean(selected[key]);
          const isTooLong = draft.length > PRODUCT_NAME_MAX_LENGTH;

          return (
            <article key={key} className="rounded-lg border p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                    {candidate.imageUrl ? (
                      <Image
                        src={candidate.imageUrl}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <ImageOff className="m-4 h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-semibold">
                        {candidate.name}
                      </p>
                      <Badge variant="secondary">
                        {entityType === "PRODUCT" ? "Producto" : "Grupo"}
                      </Badge>
                      {entityType === "PRODUCT" &&
                        (candidate as ProductCandidate).groupName && (
                          <Badge variant="outline">Con variantes</Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {entityType === "PRODUCT" &&
                        `${(candidate as ProductCandidate).sku} · `}
                      {candidate.categoryName || "Sin categoría"}
                      {entityType === "PRODUCT" && (
                        <>
                          {` · ${(candidate as ProductCandidate).designName}`}
                          {` · ${(candidate as ProductCandidate).colorName}`}
                          {` · ${(candidate as ProductCandidate).sizeName}`}
                        </>
                      )}
                    </p>
                    <Link
                      href={`/${params.storeId}/productos${entityType === "PRODUCT" ? `/${candidate.id}` : `/grupo/${candidate.id}`}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Abrir ficha y revisar fotos{" "}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateSuggestion(candidate)}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Preparar propuesta
                </Button>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <Input
                  value={draft}
                  onChange={(event) =>
                    updateDraft(candidate.id, event.target.value)
                  }
                  aria-label={`Nombre propuesto para ${candidate.name}`}
                />
                <span
                  className={
                    draft.length > PRODUCT_NAME_RECOMMENDED_MAX_LENGTH
                      ? "text-sm font-medium text-amber-700"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {draft.length}/{PRODUCT_NAME_RECOMMENDED_MAX_LENGTH}{" "}
                  recomendado
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {suggestion.warnings.map((warning) => (
                  <span key={warning} className="text-amber-700">
                    {warning}
                  </span>
                ))}
                {isTooLong && (
                  <span className="text-destructive">
                    Reduce el nombre antes de aplicarlo.
                  </span>
                )}
                {selectedForApply && !isTooLong && draft !== candidate.name && (
                  <span className="font-medium text-primary">
                    Se aplicará en el próximo lote.
                  </span>
                )}
                {proposalFeedback[key] && (
                  <span role="status" className="text-primary">
                    {proposalFeedback[key]}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {visibleCandidates.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No encontramos productos con esos datos.
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={safePage === 0}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
        >
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          Página {safePage + 1} de {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={safePage >= pageCount - 1}
          onClick={() =>
            setPage((current) => Math.min(pageCount - 1, current + 1))
          }
        >
          Siguiente
        </Button>
      </div>

      {recentChanges.length > 0 && (
        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4" />
            <h2 className="font-semibold">Últimos cambios de nombre</h2>
          </div>
          <div className="space-y-2">
            {recentChanges.map((change) => (
              <div
                key={change.id}
                className="flex flex-col gap-2 rounded-md bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="min-w-0 text-sm">
                  <span className="text-muted-foreground line-through">
                    {change.previousName}
                  </span>{" "}
                  <span className="font-medium">→ {change.nextName}</span>
                </p>
                {change.revertedAt ? (
                  <Badge variant="outline">Revertido</Badge>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={loading}
                    onClick={() => setRollbackId(change.id)}
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    Revertir
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
