"use client";

import type { Supplier } from "@prisma/client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Image from "next/image";
import { useState } from "react";
import { UseFormReturn } from "react-hook-form";

import { VariantEditModal } from "@/components/modals/variant-edit-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { currencyFormatter } from "@/lib/utils";
import { Archive, Pencil, Star, Trash } from "lucide-react";
import { ProductGroupFormValues } from "./product-group-form";

interface VariantGridProps {
  form: UseFormReturn<ProductGroupFormValues>;
  loading: boolean;
  images: { url: string }[];
  imageScopes: Record<string, string>;
  suppliers: Supplier[];
}

export const VariantGrid: React.FC<VariantGridProps> = ({
  form,
  loading,
  images,
  imageScopes,
  suppliers,
}) => {
  const { watch, setValue } = form;
  const formVariants = watch("variants");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(),
  );

  if (!formVariants || formVariants.length === 0) return null;

  const filteredVariants =
    formVariants
      ?.map((variant, index) => ({
        ...variant,
        originalIndex: index,
      }))
      .filter((variant) => {
        const v = variant;
        return (
          v.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }) || [];

  const toggleSelectAll = () => {
    if (selectedIndices.size === filteredVariants.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(filteredVariants.map((v) => v.originalIndex)));
    }
  };

  const toggleSelectRow = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const onDeleteSelected = () => {
    if (!formVariants) return;
    const newVariants = formVariants.filter(
      (_, index) => !selectedIndices.has(index),
    );
    setValue("variants", newVariants, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setSelectedIndices(new Set());
  };

  const onArchiveSelected = () => {
    if (!formVariants) return;
    const newVariants = formVariants.map((variant, index) => {
      if (selectedIndices.has(index)) {
        return { ...variant, isArchived: true };
      }
      return variant;
    });
    setValue("variants", newVariants, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setSelectedIndices(new Set());
  };

  const onSaveVariant = (data: any) => {
    if (editingIndex !== null) {
      // Update the specific variant in the form array
      setValue(`variants.${editingIndex}`, data, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setEditingIndex(null);
    }
  };

  const editingVariant =
    editingIndex !== null ? formVariants[editingIndex] : null;

  const getEffectiveImages = (variant: any) => {
    // 1. If explicit images exist, return them
    if (variant.images && variant.images.length > 0) {
      return variant.images;
    }

    // 2. Fallback to attribute scoping logic
    const matches = images.filter((img) => {
      const scope = imageScopes[img.url] || "all";
      if (scope === "all") return true;
      if (scope === variant.color?.id) return true;
      if (scope === variant.design?.id) return true;
      if (scope === `COMBO|${variant.color?.id}|${variant.design?.id}`)
        return true;
      return false;
    });

    return matches.map((m) => m.url);
  };

  return (
    <>
      <VariantEditModal
        isOpen={editingIndex !== null}
        onClose={() => setEditingIndex(null)}
        onConfirm={onSaveVariant}
        initialData={
          editingVariant
            ? {
                ...editingVariant,
                images: getEffectiveImages(editingVariant),
              }
            : null
        }
        suppliers={suppliers}
        groupImages={images}
      />
      <div className="space-y-4 rounded-md border p-4">
        <h3 className="text-lg font-medium">Editor de Variantes</h3>
        <div className="text-sm text-muted-foreground">
          Gestiona las variantes de tu grupo de productos.
        </div>
        <div className="flex items-center py-2">
          <Input
            placeholder="Buscar por SKU o Nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          {selectedIndices.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={onDeleteSelected}
                type="button"
              >
                <Trash className="mr-2 h-4 w-4" />
                Eliminar ({selectedIndices.size})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onArchiveSelected}
                type="button"
              >
                <Archive className="mr-2 h-4 w-4" />
                Archivar ({selectedIndices.size})
              </Button>
            </div>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={
                      filteredVariants.length > 0 &&
                      selectedIndices.size === filteredVariants.length
                    }
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Imagen</TableHead>
                <TableHead>Variante</TableHead>
                <TableHead className="w-[100px]">Costo</TableHead>
                <TableHead className="w-[120px]">Proveedor</TableHead>
                <TableHead className="w-[100px]">Precio</TableHead>
                <TableHead className="w-[100px]">Stock</TableHead>
                <TableHead className="w-[80px]">Destacado</TableHead>
                <TableHead className="w-[80px]">Archivado</TableHead>
                <TableHead className="w-[80px] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVariants.map((variant: any) => {
                const index = variant.originalIndex;
                const supplierName =
                  suppliers.find((s) => s.id === variant.supplierId)?.name ||
                  "-";

                return (
                  <TableRow key={variant.id || index}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIndices.has(index)}
                        onCheckedChange={() => toggleSelectRow(index)}
                        aria-label={`Select row ${index}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {variant.sku || (
                        <span className="italic text-muted-foreground">
                          Generado
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        let matches: { url: string }[] = [];

                        // 1. Check for explicit variant images
                        if (variant.images && variant.images.length > 0) {
                          matches = variant.images.map((url: string) => ({
                            url,
                          }));
                        } else {
                          // 2. Fallback to attribute scoping logic
                          matches = images.filter((img) => {
                            const scope = imageScopes[img.url] || "all";
                            if (scope === "all") return true;
                            if (scope === variant.color?.id) return true;
                            if (scope === variant.design?.id) return true;
                            if (
                              scope ===
                              `COMBO|${variant.color?.id}|${variant.design?.id}`
                            )
                              return true;
                            return false;
                          });
                        }

                        if (matches.length === 0) {
                          return (
                            <div className="h-10 w-10 rounded-md border bg-muted" />
                          );
                        }

                        const primaryMatch = matches[0];
                        const othersCount = matches.length - 1;

                        return (
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <div className="relative h-10 w-10 cursor-pointer overflow-hidden rounded-md border transition-colors hover:border-primary">
                                <Image
                                  src={primaryMatch.url}
                                  alt="Variant"
                                  fill
                                  className="object-cover"
                                />
                                {othersCount > 0 && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-bold text-white">
                                    +{othersCount}
                                  </div>
                                )}
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80">
                              <div className="grid grid-cols-4 gap-2">
                                {matches.map((img, i) => (
                                  <div
                                    key={i}
                                    className="relative aspect-square overflow-hidden rounded-md border"
                                  >
                                    <Image
                                      src={img.url}
                                      alt={`Variant image ${i + 1}`}
                                      fill
                                      className="object-cover"
                                    />
                                  </div>
                                ))}
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {variant.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {variant.size?.name} / {variant.color?.name} /{" "}
                          {variant.design?.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {currencyFormatter(variant.acqPrice || 0)}
                    </TableCell>
                    <TableCell
                      className="max-w-[120px] truncate text-xs"
                      title={supplierName}
                    >
                      {supplierName}
                    </TableCell>
                    <TableCell className="text-xs">
                      {currencyFormatter(variant.price || 0)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {variant.stock || 0}
                    </TableCell>
                    <TableCell>
                      {variant.isFeatured ? (
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      ) : (
                        <Star className="h-4 w-4 text-muted-foreground/30" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {variant.isArchived ? (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-medium text-red-800">
                          Si
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-medium text-green-800">
                          No
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingIndex(index)}
                        disabled={loading}
                        type="button"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
};
