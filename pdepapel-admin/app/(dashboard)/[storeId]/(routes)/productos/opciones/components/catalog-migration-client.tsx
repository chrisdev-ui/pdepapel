"use client";

import axios from "axios";
import {
  Bot,
  Check,
  Loader2,
  PackageSearch,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";

type MigrationAttribute = {
  key: string;
  name: string;
  value: string;
  confidence: number;
  evidence: string;
};

type MigrationPayload = {
  shippingProfile: {
    code: string;
    name: string;
    dimensionCode: string | null;
    weightCode: string | null;
  };
  category: {
    currentName: string;
    canonicalName: string;
    icon: string | null;
  } | null;
  type: {
    currentName: string;
    canonicalName: string;
    icon: string | null;
  } | null;
  attributes: MigrationAttribute[];
};

type MigrationSuggestion = {
  id: string;
  status: "PREPARED" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED" | "APPLIED";
  source: "DETERMINISTIC" | "AI";
  confidence: number;
  payload: MigrationPayload;
  product: {
    id: string;
    name: string;
    sku: string;
    category: { name: string };
    images: Array<{ id: string; url: string }>;
  } | null;
};

type MigrationData = {
  summary: {
    activeProducts: number;
    assignedProducts: number;
    pendingProducts: number;
    statuses: Record<string, number>;
  };
  suggestions: MigrationSuggestion[];
};

export function CatalogMigrationClient() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const endpoint = `/api/${storeId}/catalog-migration`;
  const [data, setData] = useState<MigrationData | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [draftAttributes, setDraftAttributes] = useState<
    Record<string, MigrationAttribute[]>
  >({});
  const [dirtySuggestions, setDirtySuggestions] = useState<
    Record<string, boolean>
  >({});
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"APPLY" | "AI" | null>(
    null,
  );

  const load = useCallback(async () => {
    const response = await axios.get<MigrationData>(endpoint);
    setData(response.data);
    setDraftAttributes(
      Object.fromEntries(
        response.data.suggestions.map((suggestion) => [
          suggestion.id,
          suggestion.payload.attributes,
        ]),
      ),
    );
    setDirtySuggestions({});
  }, [endpoint]);

  useEffect(() => {
    void load().catch((error) => {
      toast({
        title: "No pudimos cargar la migración",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    });
  }, [load, toast]);

  const reviewable = useMemo(
    () =>
      data?.suggestions.filter(
        (suggestion) => suggestion.status !== "APPLIED" && suggestion.product,
      ) ?? [],
    [data],
  );
  const selectedSuggestions = useMemo(
    () => reviewable.filter((suggestion) => selected[suggestion.id]),
    [reviewable, selected],
  );
  const hasUnsavedSelection = selectedSuggestions.some(
    (suggestion) => dirtySuggestions[suggestion.id],
  );

  const runMutation = async (body: unknown, successMessage: string) => {
    setLoading(true);
    try {
      await axios.post(endpoint, body);
      await load();
      setSelected({});
      router.refresh();
      toast({ title: successMessage });
    } catch (error) {
      toast({
        title: "No se completó la acción",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const enrichSelectedWithAi = async () => {
    setLoading(true);
    let enriched = 0;
    try {
      for (const suggestion of selectedSuggestions.slice(0, 20)) {
        const imageUrls = suggestion.product?.images
          .map((image) => image.url)
          .slice(0, 3);
        if (!imageUrls?.length) continue;

        const analysisResponse = await axios.post(
          `/api/${storeId}/products/image-analysis`,
          {
            imageUrls,
            categoryName: suggestion.product?.category.name,
          },
        );
        const attributes = analysisResponse.data.analysis?.catalogAttributes;
        if (!Array.isArray(attributes) || attributes.length === 0) continue;

        await axios.post(endpoint, {
          action: "MERGE_AI",
          suggestionId: suggestion.id,
          attributes,
        });
        enriched += 1;
      }

      await load();
      setSelected({});
      toast({
        title: "Análisis visual terminado",
        description:
          enriched > 0
            ? `${enriched} propuestas recibieron características para revisar.`
            : "Las fotos no mostraron características comerciales confirmables.",
      });
    } catch (error) {
      toast({
        title: "El análisis se detuvo",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const updateDraft = (
    suggestionId: string,
    nextAttributes: MigrationAttribute[],
  ) => {
    setDraftAttributes((current) => ({
      ...current,
      [suggestionId]: nextAttributes,
    }));
    setDirtySuggestions((current) => ({
      ...current,
      [suggestionId]: true,
    }));
  };

  const saveDraft = async (suggestionId: string) => {
    const attributes = (draftAttributes[suggestionId] ?? []).map(
      (attribute) => ({
        ...attribute,
        key: attribute.name,
        name: attribute.name.trim(),
        value: attribute.value.trim(),
        evidence:
          attribute.evidence.trim() ||
          "Confirmado manualmente por administración",
      }),
    );

    if (
      attributes.some(
        (attribute) => !attribute.name.trim() || !attribute.value.trim(),
      )
    ) {
      toast({
        title: "Completa la característica",
        description: "Cada opción necesita nombre y valor antes de guardarla.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await axios.post(endpoint, {
        action: "UPDATE_ATTRIBUTES",
        suggestionId,
        attributes,
      });
      await load();
      toast({ title: "Opciones guardadas para revisión" });
    } catch (error) {
      toast({
        title: "No se guardaron las opciones",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = () => {
    const selectable = reviewable.filter(
      (suggestion) => !dirtySuggestions[suggestion.id],
    );
    const shouldSelect = selectedSuggestions.length !== selectable.length;
    setSelected(
      Object.fromEntries(
        selectable.map((suggestion) => [suggestion.id, shouldSelect]),
      ),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <Heading
          title="Opciones claras para clientes"
          description="Separa formatos, capacidades y medidas visibles de los perfiles internos usados para envío y SKU. Nada cambia hasta que revises y apliques una propuesta."
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() =>
              void runMutation(
                { action: "PREPARE", limit: 100 },
                "Propuestas preparadas para revisión",
              )
            }
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Preparar propuestas
          </Button>
          <Button
            disabled={
              loading || selectedSuggestions.length === 0 || hasUnsavedSelection
            }
            onClick={() => setConfirmAction("APPLY")}
          >
            <Check className="mr-2 h-4 w-4" />
            Aplicar seleccionadas ({selectedSuggestions.length})
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Productos activos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">
            {data?.summary.activeProducts ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Perfil logístico separado
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-emerald-600">
            {data?.summary.assignedProducts ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-amber-600">
            {data?.summary.pendingProducts ?? "—"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Revisión por lote</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Los códigos S, S+, M-P y similares permanecen internos. Solo las
              características confirmadas se mostrarán como filtros.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={toggleAll}
              disabled={!reviewable.length}
            >
              {selectedSuggestions.length === reviewable.length &&
              reviewable.length > 0
                ? "Quitar selección"
                : "Seleccionar visibles"}
            </Button>
            <Button
              variant="outline"
              disabled={
                loading ||
                selectedSuggestions.length === 0 ||
                hasUnsavedSelection
              }
              onClick={() => setConfirmAction("AI")}
            >
              <Bot className="mr-2 h-4 w-4" />
              Analizar fotos ({Math.min(selectedSuggestions.length, 20)})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data ? (
            <div className="flex min-h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Cargando" />
            </div>
          ) : reviewable.length === 0 ? (
            <div className="min-h-40 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <PackageSearch className="h-8 w-8" />
              <p>Prepara propuestas para comenzar la migración segura.</p>
            </div>
          ) : (
            reviewable.map((suggestion) => (
              <article
                key={suggestion.id}
                className="grid gap-4 rounded-lg border p-4 md:grid-cols-[auto_72px_minmax(0,1fr)]"
              >
                <Checkbox
                  aria-label={`Seleccionar ${suggestion.product?.name}`}
                  checked={Boolean(selected[suggestion.id])}
                  disabled={Boolean(dirtySuggestions[suggestion.id])}
                  onCheckedChange={(checked) =>
                    setSelected((current) => ({
                      ...current,
                      [suggestion.id]: checked === true,
                    }))
                  }
                />
                <div className="relative h-[72px] w-[72px] overflow-hidden rounded-md bg-muted">
                  {suggestion.product?.images[0] ? (
                    <Image
                      src={suggestion.product.images[0].url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="72px"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-semibold">
                        {suggestion.product?.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {suggestion.product?.sku} ·{" "}
                        {suggestion.product?.category.name}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={
                          suggestion.source === "AI" ? "info" : "secondary"
                        }
                      >
                        {suggestion.source === "AI"
                          ? "Revisar IA"
                          : "Regla segura"}
                      </Badge>
                      <Badge variant="outline">
                        Envío: {suggestion.payload.shippingProfile.code}
                      </Badge>
                    </div>
                  </div>
                  {(suggestion.payload.category || suggestion.payload.type) && (
                    <p className="text-sm">
                      Se separará el icono de la categoría sin cambiar su URL.
                    </p>
                  )}
                  {suggestion.payload.attributes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {suggestion.payload.attributes.map((attribute) => (
                        <Badge
                          key={`${attribute.key}-${attribute.value}`}
                          variant="outline"
                        >
                          {attribute.name}: {attribute.value}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sin característica comercial confirmada. El perfil de
                      envío sí puede separarse de forma segura.
                    </p>
                  )}
                  <details className="rounded-md border bg-muted/20 p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Revisar o editar opciones visibles
                    </summary>
                    <div className="mt-3 space-y-3">
                      {(draftAttributes[suggestion.id] ?? []).map(
                        (attribute, index) => (
                          <div
                            key={`${suggestion.id}-${index}`}
                            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                          >
                            <Input
                              aria-label={`Nombre de opción ${index + 1} para ${suggestion.product?.name}`}
                              value={attribute.name}
                              disabled={loading}
                              placeholder="Ej. Formato"
                              onChange={(event) => {
                                const next = [
                                  ...(draftAttributes[suggestion.id] ?? []),
                                ];
                                next[index] = {
                                  ...attribute,
                                  name: event.target.value,
                                };
                                updateDraft(suggestion.id, next);
                              }}
                            />
                            <Input
                              aria-label={`Valor de opción ${index + 1} para ${suggestion.product?.name}`}
                              value={attribute.value}
                              disabled={loading}
                              placeholder="Ej. A5"
                              onChange={(event) => {
                                const next = [
                                  ...(draftAttributes[suggestion.id] ?? []),
                                ];
                                next[index] = {
                                  ...attribute,
                                  value: event.target.value,
                                };
                                updateDraft(suggestion.id, next);
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={loading}
                              aria-label={`Quitar ${attribute.name || "opción"}`}
                              onClick={() =>
                                updateDraft(
                                  suggestion.id,
                                  (draftAttributes[suggestion.id] ?? []).filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ),
                      )}
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            loading ||
                            (draftAttributes[suggestion.id]?.length ?? 0) >= 8
                          }
                          onClick={() =>
                            updateDraft(suggestion.id, [
                              ...(draftAttributes[suggestion.id] ?? []),
                              {
                                key: "nueva-opcion",
                                name: "",
                                value: "",
                                confidence: 1,
                                evidence:
                                  "Confirmado manualmente por administración",
                              },
                            ])
                          }
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Agregar opción
                        </Button>
                        <Button
                          type="button"
                          disabled={loading || !dirtySuggestions[suggestion.id]}
                          onClick={() => void saveDraft(suggestion.id)}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Guardar opciones
                        </Button>
                      </div>
                      {dirtySuggestions[suggestion.id] && (
                        <p className="text-xs text-amber-700">
                          Guarda esta propuesta antes de seleccionarla.
                        </p>
                      )}
                    </div>
                  </details>
                </div>
              </article>
            ))
          )}
        </CardContent>
      </Card>

      <Modal
        title={
          confirmAction === "AI"
            ? "Analizar fotos seleccionadas"
            : "Aplicar cambios revisados"
        }
        description={
          confirmAction === "AI"
            ? "Se analizarán de forma secuencial hasta 20 productos y se reutilizará la caché cuando las fotos ya fueron procesadas. No se aplicará ningún cambio automáticamente."
            : "Se crearán perfiles logísticos y opciones comerciales para las filas seleccionadas. Stock, SKU, precios, nombres de producto y URLs no se modificarán."
        }
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
      >
        <Separator className="my-4" />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => setConfirmAction(null)}
          >
            Cancelar
          </Button>
          <Button
            disabled={loading}
            onClick={() => {
              if (confirmAction === "AI") {
                void enrichSelectedWithAi();
                return;
              }
              void runMutation(
                {
                  action: "APPLY",
                  suggestionIds: selectedSuggestions.map((item) => item.id),
                },
                "Cambios aplicados de forma segura",
              );
            }}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
