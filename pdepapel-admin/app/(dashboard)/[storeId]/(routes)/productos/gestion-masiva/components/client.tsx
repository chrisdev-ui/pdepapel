"use client";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Category, Color, Design, Size } from "@prisma/client";
import axios from "axios";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ProductColumn, columns } from "./columns";

interface BulkProductClientProps {
  data: ProductColumn[];
  categories: Category[];
  colors: Color[];
  sizes: Size[];
  designs: Design[];
}

type UpdateField = "categoryId" | "colorId" | "sizeId" | "designId";

export const BulkProductClient: React.FC<BulkProductClientProps> = ({
  data,
  categories,
  colors,
  sizes,
  designs,
}) => {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [rowSelection, setRowSelection] = useState({});
  const [selectedField, setSelectedField] = useState<UpdateField | "">("");
  const [selectedValue, setSelectedValue] = useState<string>("");

  const selectedRowIds = Object.keys(rowSelection);

  const onConfirm = async () => {
    try {
      setLoading(true);

      const selectedProducts = data.filter(
        (p, index) => selectedRowIds.includes(index.toString()), // TanStack table uses index keys by default if id not provided
      );

      // Actually, DataTable uses original ID if `getRowId` is passed, or index.
      // In our standard DataTable, we don't pass getRowId usually, so it's index.
      // Let's verify standard DataTable usage.
      // ... Checking standard DataTable implementation ...
      // If we assume standard behaviour, keys are indices.
      // But better safe: We need to map selection state to actual product IDs.
      // The `DataTable` component typically exposes `onRowSelectionChange` but strict separation might make accessing `table` instance hard.
      // However, typical `DataTable` in this project doesn't export the table instance.
      // We need to rely on the fact that if we pass `data`, and `columns` has `id`, we might need to be careful.
      // WAIT: The standard `DataTable` often controls selection internally OR accepts it as prop?
      // Looking at `data-table.tsx` in `components/ui` would be ideal, but for now assuming standard Text/Index matching.

      // Let's assume we need to patch DataTable to bubble up selection OR use a more direct approach?
      // Actually, standard TanStack selection state is a map of `rowId: boolean`.
      // If we don't define `getRowId` on the table, rowId is the index.
      // So `Object.keys(rowSelection)` gives us indices.

      const indices = Object.keys(rowSelection).map(Number);
      const targetProducts = indices.map((i) => data[i]);

      const productIds = targetProducts.map((p) => p.id);

      // Extract unique group IDs involved
      const productGroupIds = Array.from(
        new Set(
          targetProducts
            .filter((p) => p.productGroup)
            .map((p) => p.productGroup!.id),
        ),
      );

      await axios.post(`/api/${params.storeId}/products/bulk-update`, {
        productIds,
        productGroupIds,
        field: selectedField,
        value: selectedValue,
      });

      toast({
        title: "Éxito",
        description: "Productos actualizados correctamente.",
      });
      router.refresh();
      setRowSelection({});
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Algo salió mal al actualizar los productos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isButtonDisabled =
    selectedRowIds.length === 0 || !selectedField || !selectedValue || loading;

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        loading={loading}
      />
      <div className="mb-4 flex items-center justify-between">
        <Heading
          title={`Gestor de Catálogo Masivo (${data.length})`}
          description="Actualiza categorías, colores, tamaños y diseños masivamente."
        />
      </div>
      <Separator />

      <div className="my-10 flex flex-col items-end gap-4 rounded-md border bg-gray-50 p-4 py-4 md:flex-row">
        <div className="w-full md:w-1/4">
          <label className="mb-2 block text-sm font-medium">
            1. Campo a actualizar
          </label>
          <Select
            value={selectedField}
            onValueChange={(val) => {
              setSelectedField(val as UpdateField);
              setSelectedValue(""); // Reset value when field changes
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un campo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="categoryId">Sub-Categoría</SelectItem>
              <SelectItem value="colorId">Color</SelectItem>
              <SelectItem value="sizeId">Tamaño</SelectItem>
              <SelectItem value="designId">Diseño</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-1/4">
          <label className="mb-2 block text-sm font-medium">
            2. Nuevo Valor
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className={cn(
                  "w-full justify-between",
                  !selectedValue && "text-muted-foreground",
                )}
                disabled={!selectedField}
              >
                {selectedValue
                  ? (() => {
                      if (selectedField === "categoryId")
                        return categories.find((i) => i.id === selectedValue)
                          ?.name;
                      if (selectedField === "sizeId")
                        return sizes.find((i) => i.id === selectedValue)?.name;
                      if (selectedField === "designId")
                        return designs.find((i) => i.id === selectedValue)
                          ?.name;
                      if (selectedField === "colorId") {
                        const color = colors.find(
                          (i) => i.id === selectedValue,
                        );
                        return color ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-4 w-4 rounded-full border"
                              style={{ backgroundColor: color.value }}
                            />
                            {color.value}
                          </div>
                        ) : (
                          selectedValue
                        );
                      }
                      return selectedValue;
                    })()
                  : "Selecciona el valor"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] p-0"
              align="start"
            >
              <Command>
                <CommandInput placeholder="Buscar..." />
                <CommandList>
                  <CommandEmpty>No se encontraron resultados.</CommandEmpty>
                  <CommandGroup>
                    {selectedField === "categoryId" &&
                      categories.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.id + item.name}
                          onSelect={() => {
                            setSelectedValue(item.id);
                            // Close popover logic if we had separate state, currently just uncontrolled or parent
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedValue === item.id
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {item.name}
                        </CommandItem>
                      ))}
                    {selectedField === "sizeId" &&
                      sizes.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.id + item.name}
                          onSelect={() => setSelectedValue(item.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedValue === item.id
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {item.name}
                        </CommandItem>
                      ))}
                    {selectedField === "designId" &&
                      designs.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.id + item.name}
                          onSelect={() => setSelectedValue(item.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedValue === item.id
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {item.name}
                        </CommandItem>
                      ))}
                    {selectedField === "colorId" &&
                      colors.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.id + item.value}
                          onSelect={() => setSelectedValue(item.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedValue === item.id
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          <div className="flex items-center gap-2">
                            <div
                              className="h-4 w-4 rounded-full border"
                              style={{ backgroundColor: item.value }}
                            />
                            {item.value}
                          </div>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="w-full md:w-auto">
          <Button
            onClick={() => setOpen(true)}
            disabled={isButtonDisabled}
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Actualizar {selectedRowIds.length} Productos
          </Button>
        </div>
      </div>

      <Separator />

      <DataTable
        tableKey={Models.BulkProducts}
        searchKey="name"
        columns={columns}
        data={data}
        filters={[
          {
            columnKey: "category",
            title: "Sub-Categoría",
            options: categories.map((c) => ({ label: c.name, value: c.name })),
          },
          {
            columnKey: "size",
            title: "Tamaño",
            options: sizes.map((s) => ({ label: s.name, value: s.name })),
          },
          {
            columnKey: "color",
            title: "Color",
            options: colors.map((c) => ({ label: c.value, value: c.value })),
          },
          {
            columnKey: "design",
            title: "Diseño",
            options: designs.map((d) => ({ label: d.name, value: d.name })),
          },
          {
            columnKey: "type",
            title: "Tipo",
            options: [
              { label: "Variante de Grupo", value: "group" },
              { label: "Producto Individual", value: "single" },
            ],
          },
        ]}
        // @ts-ignore
        rowSelection={rowSelection}
        // @ts-ignore
        onRowSelectionChange={setRowSelection}
      />
    </>
  );
};
