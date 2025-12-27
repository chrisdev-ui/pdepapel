"use client";
import { BrandedLoader } from "@/components/ui/branded-loader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import axios from "axios";
import { CheckCircle2, Search } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";

interface Product {
  id: string;
  name: string;
  category: { id: string; name: string };
  size?: { id: string; name: string; value: string };
  color?: { id: string; name: string; value: string };
  design?: { id: string; name: string };
  images: { url: string }[];
  price: number;
  productGroupId?: string | null;
}

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedProducts: Product[]) => void;
  currentCategoryId?: string;
  categories: { id: string; name: string }[];
}

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export const ProductImportModal: React.FC<ProductImportModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentCategoryId,
  categories,
}) => {
  const params = useParams();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    currentCategoryId || "",
  );

  const observerTarget = useRef<HTMLDivElement>(null);

  // Sync prop category change
  useEffect(() => {
    if (currentCategoryId) {
      setSelectedCategory(currentCategoryId);
    }
  }, [currentCategoryId]);

  const getKey = (pageIndex: number, previousPageData: any) => {
    if (previousPageData && !previousPageData.metadata.hasMore) return null;
    if (!isOpen) return null; // Don't fetch if closed

    let url = `/api/${params.storeId}/search/products/isolated?page=${
      pageIndex + 1
    }&limit=20`;

    if (debouncedSearchQuery) url += `&query=${debouncedSearchQuery}`;
    if (selectedCategory && selectedCategory !== "all")
      url += `&categoryId=${selectedCategory}`;

    return url;
  };

  const { data, size, setSize, isValidating } = useSWRInfinite(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false,
    },
  );

  const products: Product[] = data ? data.flatMap((page) => page.data) : [];
  const isLoading = !data && isValidating;
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const isEmpty = data?.[0]?.data?.length === 0;
  const isReachingEnd =
    isEmpty || (data && data[data.length - 1]?.metadata?.hasMore === false);

  const toggleSelect = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;

    const next = new Set(selectedIds);

    if (next.has(id)) {
      next.delete(id);
    } else {
      // Validate Category - If any products selected, new one must match their category
      if (next.size > 0) {
        // Find existing category from the first selected product
        const firstSelectedId = Array.from(next)[0];
        const firstProduct = products.find((p) => p.id === firstSelectedId);

        if (firstProduct && firstProduct.category.id !== product.category.id) {
          toast({
            variant: "warning",
            title: "Categoría incompatible",
            description: `Solo puedes agrupar productos de la misma categoría. El grupo actual pertenece a la categoría "${firstProduct.category.name}".`,
          });
          return;
        }
      }
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleConfirm = () => {
    const selected = products.filter((p) => selectedIds.has(p.id));
    onConfirm(selected);
    onClose();
    setSelectedIds(new Set());
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setSize(1);
  }, [debouncedSearchQuery, selectedCategory, setSize]);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isReachingEnd && !isLoadingMore) {
          setSize((prev) => prev + 1);
        }
      },
      { threshold: 0.1 },
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [observerTarget, isReachingEnd, isLoadingMore, setSize]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex h-[80vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Importar Productos Existentes</DialogTitle>
          <DialogDescription>
            Selecciona productos individuales para agruparlos.
            {currentCategoryId && (
              <span className="mt-1 block font-semibold text-primary">
                Filtrando por categoría actual:{" "}
                {categories.find((c) => c.id === currentCategoryId)?.name}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="z-10 flex items-center gap-4 bg-background py-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select
            value={selectedCategory}
            onValueChange={setSelectedCategory}
            disabled={!!currentCategoryId} // Disable if parent form already has a category set
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto rounded-md border p-2">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center">
              <BrandedLoader />
            </div>
          ) : products.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No se encontraron productos disponibles.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className={cn(
                      "relative cursor-pointer rounded-lg border p-3 transition-all hover:shadow-md",
                      selectedIds.has(product.id)
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border",
                    )}
                    onClick={() => toggleSelect(product.id)}
                  >
                    {selectedIds.has(product.id) && (
                      <div className="absolute right-2 top-2 z-10 duration-200 animate-in zoom-in-50">
                        <div className="rounded-full bg-background/80 p-0.5 shadow-sm">
                          <CheckCircle2 className="h-5 w-5 fill-primary text-primary-foreground" />
                        </div>
                      </div>
                    )}

                    <div className="relative mb-2 aspect-square overflow-hidden rounded-md bg-muted">
                      {product.images?.[0] ? (
                        <Image
                          src={product.images[0].url}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          Sin imagen
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="line-clamp-2 text-sm font-medium leading-tight">
                        {product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {product.size?.name} • {product.color?.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Infinite Scroll Trigger */}
              {!isReachingEnd && (
                <div
                  ref={observerTarget}
                  className="my-4 flex h-10 w-full items-center justify-center gap-2"
                >
                  {isLoadingMore && (
                    <>
                      <span className="text-sm text-muted-foreground">
                        Cargando más...
                      </span>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex w-full items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} productos seleccionados
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleConfirm} disabled={selectedIds.size === 0}>
                Importar Seleccionados
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
