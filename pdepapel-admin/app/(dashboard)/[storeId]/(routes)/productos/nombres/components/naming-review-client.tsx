"use client";

import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_RECOMMENDED_MAX_LENGTH,
  buildProductNameSuggestion,
} from "@/lib/product-naming";
import axios from "axios";
import { Check, RefreshCcw, Search, Sparkles, Undo2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ProductCandidate = {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  categoryName: string;
  colorName: string;
  sizeName: string;
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
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rollbackId, setRollbackId] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-CO");
    const source = entityType === "PRODUCT" ? products : groups;

    return source.filter((candidate) => {
      if (!normalizedQuery) return true;
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
      return text.includes(normalizedQuery);
    });
  }, [entityType, groups, products, query]);

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

  const suggestionFor = (candidate: ProductCandidate | GroupCandidate) => {
    const isProduct = entityType === "PRODUCT";
    return buildProductNameSuggestion({
      baseName: candidate.name,
      categoryName: candidate.categoryName,
      brand: candidate.brand,
      designName: isProduct ? (candidate as ProductCandidate).designName : null,
      colorName: isProduct ? (candidate as ProductCandidate).colorName : null,
      sizeName: isProduct ? (candidate as ProductCandidate).sizeName : null,
      includeVariantAttributes: isProduct,
    });
  };

  const updateSuggestion = (candidate: ProductCandidate | GroupCandidate) => {
    const key = entityKey(entityType, candidate.id);
    const suggestion = suggestionFor(candidate);
    setDrafts((current) => ({ ...current, [key]: suggestion.name }));
    setSelected((current) => ({ ...current, [key]: true }));
  };

  const updateDraft = (id: string, name: string) => {
    const key = entityKey(entityType, id);
    setDrafts((current) => ({ ...current, [key]: name }));
    setSelected((current) => ({ ...current, [key]: true }));
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

      <Tabs
        value={entityType}
        onValueChange={(value) => {
          setEntityType(value as EntityType);
          setPage(0);
          setSelected({});
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
        <p className="text-sm text-muted-foreground">
          {candidates.length} resultado{candidates.length === 1 ? "" : "s"}
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        {visibleCandidates.map((candidate) => {
          const key = entityKey(entityType, candidate.id);
          const suggestion = suggestionFor(candidate);
          const draft = drafts[key] ?? suggestion.name;
          const selectedForApply = Boolean(selected[key]);
          const isTooLong = draft.length > PRODUCT_NAME_MAX_LENGTH;

          return (
            <article key={key} className="rounded-lg border p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{candidate.name}</p>
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
