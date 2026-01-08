"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { zodResolver } from "@hookform/resolvers/zod";
import { Supplier } from "@prisma/client";
import axios from "axios";
import { Download, FileUp, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Papa from "papaparse";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

// CSV Row Schema
interface CSVRow {
  name: string;
  description?: string;
  price: string;
  acqPrice?: string;
  sku?: string;
  categoryName: string;
  sizeName: string;
  colorName: string;
  designName: string;
  stock?: string;
  images?: string;
}

// Form Schema for modal options
const importFormSchema = z.object({
  csvFile: z
    .instanceof(File, { message: "Debes seleccionar un archivo CSV" })
    .refine((file) => file.name.endsWith(".csv"), {
      message: "El archivo debe ser de tipo CSV",
    })
    .optional(),
  createRestockOrder: z.boolean().default(false),
  supplierId: z.string().optional(),
  shippingCost: z.coerce.number().optional().default(0),
});

type ImportFormValues = z.infer<typeof importFormSchema>;

interface ProductBatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
}

const CSV_HEADERS = [
  "name",
  "description",
  "price",
  "acqPrice",
  "sku",
  "categoryName",
  "sizeName",
  "colorName",
  "designName",
  "stock",
  "images",
];

const SAMPLE_ROW = {
  name: "Producto Ejemplo",
  description: "Descripción del producto",
  price: "25000",
  acqPrice: "15000",
  sku: "",
  categoryName: "Regalos",
  sizeName: "Mediano",
  colorName: "Rosa",
  designName: "Clásico",
  stock: "10",
  images: "",
};

export const ProductBatchImportModal: React.FC<
  ProductBatchImportModalProps
> = ({ isOpen, onClose, suppliers }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState<CSVRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      csvFile: undefined,
      createRestockOrder: false,
      supplierId: "",
      shippingCost: 0,
    },
  });

  const createRestockOrder = form.watch("createRestockOrder");

  // Generate and download CSV template
  const handleDownloadTemplate = useCallback(() => {
    const csvContent = Papa.unparse({
      fields: CSV_HEADERS,
      data: [SAMPLE_ROW],
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "productos_plantilla.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Parse CSV file
  const handleFileChange = useCallback((file: File | undefined) => {
    if (!file) {
      setParsedData([]);
      setParseErrors([]);
      return;
    }

    setParseErrors([]);
    setParsedData([]);

    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: string[] = [];
        const validRows: CSVRow[] = [];

        results.data.forEach((row, index) => {
          const rowErrors: string[] = [];

          // Validate required fields
          if (!row.name?.trim()) rowErrors.push("name");
          if (!row.price?.trim() || isNaN(Number(row.price)))
            rowErrors.push("price");
          if (!row.categoryName?.trim()) rowErrors.push("categoryName");
          if (!row.sizeName?.trim()) rowErrors.push("sizeName");
          if (!row.colorName?.trim()) rowErrors.push("colorName");
          if (!row.designName?.trim()) rowErrors.push("designName");

          if (rowErrors.length > 0) {
            errors.push(
              `Fila ${index + 2}: Campos requeridos faltantes o inválidos: ${rowErrors.join(", ")}`,
            );
          } else {
            validRows.push(row);
          }
        });

        if (errors.length > 0) {
          setParseErrors(errors);
        }
        setParsedData(validRows);
      },
      error: (error) => {
        setParseErrors([`Error al leer el archivo: ${error.message}`]);
      },
    });
  }, []);

  // Submit the import
  const onSubmit = async (formValues: ImportFormValues) => {
    if (parsedData.length === 0) {
      toast({
        variant: "destructive",
        description: "No hay productos válidos para importar.",
      });
      return;
    }

    if (formValues.createRestockOrder && !formValues.supplierId) {
      toast({
        variant: "destructive",
        description:
          "Debes seleccionar un proveedor para crear la orden de restock.",
      });
      return;
    }

    try {
      setLoading(true);

      const payload = {
        products: parsedData.map((row) => ({
          name: row.name.trim(),
          description: row.description?.trim() || "",
          price: Number(row.price),
          acqPrice: row.acqPrice ? Number(row.acqPrice) : 0,
          sku: row.sku?.trim() || "",
          categoryName: row.categoryName.trim(),
          sizeName: row.sizeName.trim(),
          colorName: row.colorName.trim(),
          designName: row.designName.trim(),
          stock: row.stock ? Number(row.stock) : 0,
          images: row.images
            ? row.images
                .split(",")
                .map((url) => url.trim())
                .filter(Boolean)
            : [],
        })),
        supplierId: formValues.createRestockOrder
          ? formValues.supplierId
          : undefined,
        shippingCost: formValues.createRestockOrder
          ? formValues.shippingCost
          : undefined,
      };

      const response = await axios.post(
        `/api/${params.storeId}/products/batch`,
        payload,
      );

      toast({
        description: `Se importaron ${response.data.successCount} productos exitosamente.`,
        variant: "success",
      });

      // Reset state
      setParsedData([]);
      setParseErrors([]);
      form.reset();
      onClose();
      router.refresh();
    } catch (error) {
      toast({
        variant: "destructive",
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setParsedData([]);
    setParseErrors([]);
    form.reset();
    onClose();
  };

  return (
    <Modal
      title="Importar Productos por CSV"
      description="Carga un archivo CSV para importar productos de forma masiva."
      isOpen={isOpen}
      onClose={handleClose}
      className="max-w-4xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Template Download */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
            <div>
              <p className="text-sm font-medium">Plantilla CSV</p>
              <p className="text-xs text-muted-foreground">
                Descarga la plantilla con el formato correcto para evitar
                errores.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadTemplate}
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar Plantilla
            </Button>
          </div>

          {/* File Input */}
          <FormField
            control={form.control}
            name="csvFile"
            render={({ field: { onChange, value, ...field } }) => (
              <FormItem>
                <FormLabel isRequired>Archivo CSV</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-4">
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        onChange(file);
                        handleFileChange(file);
                      }}
                      disabled={loading}
                      className="flex-1"
                      {...field}
                    />
                    <FileUp className="h-5 w-5 text-muted-foreground" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Parse Errors */}
          {parseErrors.length > 0 && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3">
              <p className="mb-2 text-sm font-medium text-destructive">
                Errores de validación:
              </p>
              <ul className="list-inside list-disc space-y-1 text-xs text-destructive">
                {parseErrors.slice(0, 5).map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
                {parseErrors.length > 5 && (
                  <li>...y {parseErrors.length - 5} errores más.</li>
                )}
              </ul>
            </div>
          )}

          {/* Restock Order Options */}
          <div className="space-y-4 rounded-lg border p-4">
            <FormField
              control={form.control}
              name="createRestockOrder"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel isRequired>Generar Orden de Restock</FormLabel>
                    <FormDescription>
                      Crea una orden de restock vinculada a esta importación
                      para llevar control del inventario.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {createRestockOrder && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proveedor</FormLabel>
                      <Select
                        disabled={loading}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un proveedor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shippingCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Costo de Envío</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          disabled={loading}
                          placeholder="0"
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>

          {/* Preview Table */}
          {parsedData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Vista Previa ({parsedData.length} productos válidos)
                </p>
              </div>
              <ScrollArea className="h-[200px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Nombre</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Costo</TableHead>
                      <TableHead>Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 10).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {row.name}
                        </TableCell>
                        <TableCell>{row.categoryName}</TableCell>
                        <TableCell>
                          ${Number(row.price).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          ${Number(row.acqPrice || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>{row.stock || 0}</TableCell>
                      </TableRow>
                    ))}
                    {parsedData.length > 10 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          ...y {parsedData.length - 10} productos más.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {/* Actions */}
          <div className="flex w-full items-center justify-end space-x-2 pt-4">
            <Button
              disabled={loading}
              variant="outline"
              onClick={handleClose}
              type="button"
            >
              Cancelar
            </Button>
            <Button disabled={loading || parsedData.length === 0} type="submit">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar {parsedData.length > 0 ? `(${parsedData.length})` : ""}
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
};
