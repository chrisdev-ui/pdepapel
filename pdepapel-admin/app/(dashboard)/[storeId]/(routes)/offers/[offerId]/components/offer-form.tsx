"use client";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Models, discountOptions } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { currencyFormatter, datePresets } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DiscountType,
  Offer,
  OfferCategory,
  OfferProduct,
} from "@prisma/client";
import axios from "axios";
import {
  ArrowLeft,
  CheckSquare,
  DollarSign,
  Loader2,
  Percent,
  Square,
  Trash,
} from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  label: z.string().optional(),
  type: z.nativeEnum(DiscountType),
  amount: z.coerce.number().min(0),
  dateRange: z.object({
    from: z.date({
      required_error: "La fecha de inicio es requerida",
      invalid_type_error: "La fecha de inicio debe ser una fecha válida",
    }),
    to: z.date({
      required_error: "La fecha de finalización es requerida",
      invalid_type_error: "La fecha de finalización debe ser una fecha válida",
    }),
  }),
  isActive: z.boolean().default(true),
  productIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
});

type OfferFormValues = z.infer<typeof formSchema>;

interface OfferFormProps {
  initialData:
    | (Offer & {
        products: OfferProduct[];
        categories: OfferCategory[];
      })
    | null;
  products: {
    id: string;
    name: string;
    price: number;
    stock: number;
    images: { url: string; isMain: boolean }[];
    category: { name: string };
  }[];
  categories: {
    id: string;
    name: string;
    type: { name: string };
  }[];
}

export const OfferForm: React.FC<OfferFormProps> = ({
  initialData,
  products,
  categories,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");

  const title = initialData ? "Editar oferta" : "Crear oferta";
  const description = initialData
    ? "Editar una oferta"
    : "Agregar una nueva oferta";
  const toastMessage = initialData ? "Oferta actualizada" : "Oferta creada";
  const action = initialData ? "Guardar cambios" : "Crear";
  const pendingText = initialData ? "Actualizando..." : "Creando...";

  const defaultValues = initialData
    ? {
        ...initialData,
        label: initialData.label || "",
        dateRange: {
          from: initialData.startDate,
          to: initialData.endDate,
        },
        productIds: initialData.products.map((p) => p.productId),
        categoryIds: initialData.categories.map((c) => c.categoryId),
      }
    : {
        name: "",
        label: "",
        type: DiscountType.PERCENTAGE,
        amount: 0,
        dateRange: {
          from: undefined,
          to: undefined,
        },
        isActive: true,
        productIds: [],
        categoryIds: [],
      };

  const form = useForm<OfferFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const onSubmit = async ({ dateRange, ...data }: OfferFormValues) => {
    const payload = {
      ...data,
      startDate: dateRange.from,
      endDate: dateRange.to,
    };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/${Models.Offers}/${params.offerId}`,
          payload,
        );
      } else {
        await axios.post(`/api/${params.storeId}/${Models.Offers}`, payload);
      }
      router.refresh();
      router.push(`/${params.storeId}/${Models.Offers}`);
      toast({
        description: toastMessage,
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/${Models.Offers}/${params.offerId}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/${Models.Offers}`);
      toast({
        description: "Oferta eliminada",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(productSearch.toLowerCase()),
  );

  const filteredCategories = categories.filter(
    (category) =>
      category.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
      category.type.name.toLowerCase().includes(categorySearch.toLowerCase()),
  );

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Heading title={title} description={description} />
        </div>
        {initialData && (
          <Button
            disabled={loading}
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-8"
        >
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Nombre interno</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Oferta de Verano"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etiqueta pública</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: 20% OFF"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Texto que se mostrará en la tienda
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Tipo de descuento</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={DiscountType.PERCENTAGE}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue defaultValue={DiscountType.PERCENTAGE} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(DiscountType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {discountOptions[type]}
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
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Monto del descuento</FormLabel>
                  <FormControl>
                    <div className="relative">
                      {form.watch("type") === DiscountType.PERCENTAGE ? (
                        <Percent className="absolute left-3 top-3 h-4 w-4" />
                      ) : (
                        <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      )}
                      <Input
                        type="number"
                        disabled={loading}
                        className="pl-8"
                        placeholder={
                          form.watch("type") === DiscountType.PERCENTAGE
                            ? "10"
                            : "10000"
                        }
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateRange"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>
                    Fecha de inicio y finalización
                  </FormLabel>
                  <FormControl>
                    <DateRangePicker
                      customDates={datePresets}
                      name={field.name}
                      control={form.control}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel isRequired>Estado de la oferta</FormLabel>
                    <FormDescription>
                      Activar o desactivar la oferta
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <Separator />
          <Heading
            title="Alcance de la oferta"
            description="Selecciona categorías o productos específicos"
          />

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <FormField
              control={form.control}
              name="categoryIds"
              render={() => (
                <FormItem>
                  <div className="mb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel isRequired className="text-base">
                        Categorías
                      </FormLabel>
                      <button
                        type="button"
                        onClick={() => {
                          const currentValues =
                            form.getValues("categoryIds") || [];
                          const allCategoryIds = filteredCategories.map(
                            (c) => c.id,
                          );
                          if (currentValues.length === allCategoryIds.length) {
                            form.setValue("categoryIds", []);
                          } else {
                            form.setValue("categoryIds", allCategoryIds);
                          }
                        }}
                        className="group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all hover:bg-primary/10"
                      >
                        {(form.watch("categoryIds")?.length || 0) ===
                          filteredCategories.length &&
                        filteredCategories.length > 0 ? (
                          <>
                            <CheckSquare className="h-4 w-4 text-primary" />
                            <span className="text-primary">
                              Deseleccionar todo
                            </span>
                          </>
                        ) : (
                          <>
                            <Square className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                            <span className="text-muted-foreground group-hover:text-primary">
                              Seleccionar todo
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                    <FormDescription>
                      Aplica el descuento a todos los productos de estas
                      categorías.
                    </FormDescription>
                    <Input
                      placeholder="Buscar categorías..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                    />
                  </div>
                  <ScrollArea className="h-96 rounded-md border p-4">
                    {filteredCategories.map((category) => (
                      <FormField
                        key={category.id}
                        control={form.control}
                        name="categoryIds"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={category.id}
                              className="mb-3 flex flex-row items-start space-x-3 space-y-0 rounded-md border p-2 hover:bg-accent"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(category.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([
                                          ...(field.value || []),
                                          category.id,
                                        ])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== category.id,
                                          ),
                                        );
                                  }}
                                />
                              </FormControl>
                              <div className="flex-1 space-y-0.5">
                                <FormLabel
                                  isRequired
                                  className="cursor-pointer font-normal"
                                >
                                  {category.name}
                                </FormLabel>
                                <p className="text-xs text-muted-foreground">
                                  Tipo: {category.type.name}
                                </p>
                              </div>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </ScrollArea>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="productIds"
              render={() => (
                <FormItem>
                  <div className="mb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel isRequired className="text-base">
                        Productos
                      </FormLabel>
                      <button
                        type="button"
                        onClick={() => {
                          const currentValues =
                            form.getValues("productIds") || [];
                          const allProductIds = filteredProducts.map(
                            (p) => p.id,
                          );
                          if (currentValues.length === allProductIds.length) {
                            form.setValue("productIds", []);
                          } else {
                            form.setValue("productIds", allProductIds);
                          }
                        }}
                        className="group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all hover:bg-primary/10"
                      >
                        {(form.watch("productIds")?.length || 0) ===
                          filteredProducts.length &&
                        filteredProducts.length > 0 ? (
                          <>
                            <CheckSquare className="h-4 w-4 text-primary" />
                            <span className="text-primary">
                              Deseleccionar todo
                            </span>
                          </>
                        ) : (
                          <>
                            <Square className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                            <span className="text-muted-foreground group-hover:text-primary">
                              Seleccionar todo
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                    <FormDescription>
                      Aplica el descuento a productos específicos.
                    </FormDescription>
                    <Input
                      placeholder="Buscar productos..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>
                  <ScrollArea className="h-96 rounded-md border p-4">
                    {filteredProducts.map((product) => (
                      <FormField
                        key={product.id}
                        control={form.control}
                        name="productIds"
                        render={({ field }) => {
                          const mainImage =
                            product.images.find((img) => img.isMain) ||
                            product.images[0];
                          return (
                            <FormItem
                              key={product.id}
                              className="mb-3 flex flex-row items-center space-x-3 space-y-0 rounded-md border p-2 hover:bg-accent"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(product.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([
                                          ...(field.value || []),
                                          product.id,
                                        ])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== product.id,
                                          ),
                                        );
                                  }}
                                />
                              </FormControl>
                              {mainImage && (
                                <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
                                  <Image
                                    src={mainImage.url}
                                    alt={product.name}
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                              )}
                              <div className="flex-1 space-y-0.5">
                                <FormLabel
                                  isRequired
                                  className="cursor-pointer font-normal"
                                >
                                  {product.name}
                                </FormLabel>
                                <p className="text-xs text-muted-foreground">
                                  {currencyFormatter.format(product.price)} •{" "}
                                  {product.category.name}
                                  {product.stock <= 5 && (
                                    <span className="ml-2 text-red-500">
                                      Stock: {product.stock}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </ScrollArea>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button disabled={loading} className="ml-auto" type="submit">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {pendingText}
              </>
            ) : (
              action
            )}
          </Button>
        </form>
      </Form>
    </>
  );
};
