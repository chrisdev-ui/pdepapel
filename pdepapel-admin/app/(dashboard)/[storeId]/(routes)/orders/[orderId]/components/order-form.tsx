"use client";

import {
  Coupon,
  DiscountType,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from "@prisma/client";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AutoComplete } from "@/components/ui/autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { UserCombobox } from "@/components/ui/user-combobox";
import { WhatsappButton } from "@/components/whatsapp-button";
import {
  detailsTitleOptions,
  discountOptions,
  Models,
  paymentMethodsByOption,
  paymentOptions,
  shippingOptions,
  statusOptions,
} from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  cn,
  currencyFormatter,
  generateGuestId,
  parseOrderDetails,
} from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  DollarSign,
  Percent,
  Ticket,
  Trash,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { getCoupons } from "../server/get-coupons";
import {
  getOrder,
  type GetOrderResult,
  type ProductOption,
} from "../server/get-order";

const paymentSchema = z
  .object({
    method: z.nativeEnum(PaymentMethod),
    transactionId: z.string(),
  })
  .partial();

const shippingSchema = z
  .object({
    status: z.nativeEnum(ShippingStatus),
    courier: z.string(),
    cost: z.coerce.number(),
    trackingCode: z.string(),
  })
  .partial();

const discountSchema = z
  .object({
    type: z.nativeEnum(DiscountType),
    amount: z.coerce.number().min(0),
    reason: z.string(),
  })
  .partial();

const formSchema = z.object({
  userId: z.string().default(""),
  guestId: z.string().default(""),
  fullName: z.string().min(1, "Debes agregar un nombre"),
  email: z
    .string()
    .email("Debes agregar un correo electrónico válido")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .min(10, "El número telefónico debe tener 10 dígitos")
    .max(13, "El número telefónico debe tener 13 dígitos"),
  address: z.string().min(1, "Debes agregar una dirección"),
  orderItems: z
    .array(
      z.object({ productId: z.string(), quantity: z.coerce.number().min(1) }),
    )
    .nonempty({ message: "Debes agregar al menos 1 producto" }),
  status: z.nativeEnum(OrderStatus),
  payment: paymentSchema,
  shipping: shippingSchema,
  documentId: z.string().default(""),
  subtotal: z.coerce.number().default(0),
  total: z.coerce.number().default(0),
  discount: discountSchema,
  couponCode: z.string().optional(),
});

type OrderFormValues = z.infer<typeof formSchema>;

interface OrderFormProps {
  initialData: GetOrderResult["order"];
  products: ProductOption[];
  availableCoupons: Awaited<ReturnType<typeof getCoupons>>;
  users: {
    value: string;
    label: string;
    image?: string;
  }[];
}

export const OrderForm: React.FC<OrderFormProps> = ({
  initialData,
  products,
  availableCoupons,
  users,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [loading, setLoading] = useState(false);

  const [coupon, setCoupon] = useState<Coupon | null>(null);

  const [productsSelected, setProductsSelected] = useState<ProductOption[]>(
    initialData
      ? (initialData.orderItems
          .map((item) =>
            products.find((product) => product.value === item.productId),
          )
          .filter(Boolean) as ProductOption[])
      : [],
  );

  const [quantities, setQuantity] = useState(
    initialData
      ? initialData.orderItems.reduce(
          (acc, item) => {
            acc[item.productId] = item.quantity;
            return acc;
          },
          {} as { [key: string]: number },
        )
      : {},
  );

  const { title, description, toastMessage, action } = useMemo(
    () => ({
      title: initialData ? "Editar orden" : "Crear orden",
      description: initialData ? "Editar una orden" : "Crear una nueva orden",
      toastMessage: initialData ? "Orden actualizada" : "Orden creada",
      action: initialData ? "Guardar cambios" : "Crear",
    }),
    [initialData],
  );

  const getOriginalDiscountAmount = (
    initialData: Awaited<ReturnType<typeof getOrder>>["order"],
  ) => {
    if (!initialData?.discount || !initialData?.discountType) return undefined;

    if (initialData.discountType === DiscountType.PERCENTAGE) {
      // If percentage, we need to calculate what percentage produced the stored discount
      return Number(
        ((initialData.discount / initialData.subtotal) * 100).toFixed(0),
      );
    }

    return initialData.discount;
  };

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          userId: initialData.userId || "",
          guestId: initialData.guestId || "",
          documentId: initialData.documentId || "",
          email: initialData.email || "",
          subtotal: initialData.subtotal || 0,
          total: initialData.total || 0,
          discount: {
            type: initialData.discountType || undefined,
            amount: getOriginalDiscountAmount(initialData),
            reason: initialData.discountReason || undefined,
          },
          couponCode: initialData.coupon?.code || "",
          orderItems: initialData.orderItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          payment: {
            ...initialData.payment,
            transactionId: initialData.payment?.transactionId || undefined,
          },
          shipping: {
            ...initialData.shipping,
            courier: initialData.shipping?.courier || undefined,
            trackingCode: initialData.shipping?.trackingCode || undefined,
            cost: initialData.shipping?.cost || undefined,
          },
        }
      : {
          userId: "",
          guestId: generateGuestId(),
          fullName: "",
          orderItems: [],
          phone: "",
          email: "",
          address: "",
          documentId: "",
          status: OrderStatus.CREATED,
          payment: {},
          shipping: {},
          subtotal: 0,
          total: 0,
          discount: {},
          couponCode: "",
        },
  });

  const discountType = form.watch("discount.type");
  const discountAmount = form.watch("discount.amount");

  const {
    formState: { isDirty },
  } = form;

  const orderTotals = useMemo(() => {
    if (!isDirty && initialData) {
      return {
        subtotal: initialData.subtotal,
        discount: initialData.discount,
        couponDiscount: initialData.couponDiscount,
        total: initialData.total,
      };
    }
    const subtotal = productsSelected.reduce(
      (sum, product) =>
        sum + Number(product.price) * (quantities[product.value] || 1),
      0,
    );

    let discountValue = 0;
    if (discountType && discountAmount && !isNaN(discountAmount)) {
      discountValue =
        discountType === DiscountType.PERCENTAGE
          ? (subtotal * discountAmount) / 100
          : Math.min(discountAmount, subtotal);
    }

    let couponDiscount = 0;
    if (coupon && subtotal >= (Number(coupon.minOrderValue) || 0)) {
      const afterDiscount = subtotal - discountValue;
      couponDiscount =
        coupon.type === DiscountType.PERCENTAGE
          ? (afterDiscount * Number(coupon.amount)) / 100
          : Math.min(Number(coupon.amount), afterDiscount);
    }

    const total = Math.max(0, subtotal - discountValue - couponDiscount);

    return {
      subtotal,
      discount: discountValue,
      couponDiscount,
      total,
    };
  }, [
    isDirty,
    initialData,
    productsSelected,
    quantities,
    discountType,
    discountAmount,
    coupon,
  ]);

  const onSubmit = async (data: OrderFormValues) => {
    try {
      setLoading(true);
      const updatedOrderItems = data.orderItems.map((item) => ({
        ...item,
        quantity: quantities[item.productId] || item.quantity,
      }));

      const payload = {
        ...data,
        orderItems: updatedOrderItems,
        subtotal: orderTotals.subtotal,
        total: orderTotals.total,
        discountType: data.discount?.type,
        discountAmount: data.discount?.amount,
        discountReason: data.discount?.reason,
      };

      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/${Models.Orders}/${params.orderId}`,
          payload,
        );
      } else {
        await axios.post(`/api/${params.storeId}/${Models.Orders}`, payload);
      }
      router.refresh();
      router.push(`/${params.storeId}/${Models.Orders}`);
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
        `/api/${params.storeId}/${Models.Orders}/${params.orderId}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/${Models.Orders}`);
      toast({
        description: "Orden eliminada",
        variant: "success",
        duration: 4000,
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const parsedDetails = parseOrderDetails(initialData?.payment?.details);

  useEffect(() => {
    if (initialData?.coupon) {
      setCoupon(initialData.coupon);
    }
  }, [initialData]);

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex items-center justify-between">
        <Heading title={title} description={description} />
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
          <h2 className="text-lg font-semibold">
            Orden # {initialData?.orderNumber}
          </h2>
          <div className="flex w-full flex-wrap items-start gap-2">
            {productsSelected.length > 0 &&
              productsSelected.map((product, index) => (
                <Alert key={product.value} className="max-w-xs">
                  <div className="flex items-start gap-2">
                    {product.image && (
                      <Image
                        src={product.image}
                        alt={product.value}
                        width={40}
                        height={40}
                        className="rounded-md"
                        unoptimized
                      />
                    )}
                    <div className="flex flex-col gap-2">
                      <AlertTitle>{product.label}</AlertTitle>
                      <AlertDescription>
                        {currencyFormatter.format(product.price || 0)} x{" "}
                        <Input
                          type="number"
                          min={1}
                          defaultValue={quantities[product.value] || 1}
                          onChange={(event) => {
                            const newQuantity = Number(event.target.value);
                            setQuantity((prev) => ({
                              ...prev,
                              [product.value]: newQuantity,
                            }));
                          }}
                        />
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              ))}
          </div>
          <div className="ml-auto flex flex-col space-y-2 text-right">
            <div className="text-lg font-semibold">
              Subtotal: {currencyFormatter.format(orderTotals.subtotal)}
            </div>
            {orderTotals.discount > 0 && (
              <div className="text-lg text-red-600">
                Descuento: -{currencyFormatter.format(orderTotals.discount)}
                {form.watch("discount.type") === DiscountType.PERCENTAGE && (
                  <span className="ml-1 text-xs">
                    ({form.watch("discount.amount")}%)
                  </span>
                )}
              </div>
            )}
            {orderTotals.couponDiscount > 0 && (
              <div className="text-lg text-red-600">
                Descuento cupón: -
                {currencyFormatter.format(orderTotals.couponDiscount)}
                {coupon?.type === DiscountType.PERCENTAGE && (
                  <span className="ml-1 text-xs">({coupon.amount}%)</span>
                )}
              </div>
            )}
            <div className="text-xl font-bold">
              Total: {currencyFormatter.format(orderTotals.total)}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            <FormField
              control={form.control}
              name="orderItems"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lista de Productos</FormLabel>
                  <FormControl>
                    <AutoComplete
                      options={products}
                      emptyMessage="No se encontraron productos"
                      placeholder='Escribe el nombre del producto y presiona "Enter"'
                      isLoading={loading}
                      onValuesChange={(selectedOptions) => {
                        // Check if user is trying to add unavailable products that aren't already in the order
                        const newUnavailableProducts = selectedOptions.filter(
                          (option) => {
                            const typedOption = option as ProductOption;
                            const isUnavailable = !typedOption.isAvailable;
                            const wasAlreadySelected = productsSelected.some(
                              (p) => p.value === option.value,
                            );
                            return isUnavailable && !wasAlreadySelected;
                          },
                        );

                        if (newUnavailableProducts.length > 0) {
                          toast({
                            description: `No puedes agregar productos archivados o sin stock: ${newUnavailableProducts.map((p) => p.label).join(", ")}`,
                            variant: "destructive",
                          });
                          // Filter out the unavailable products from selection
                          const validOptions = selectedOptions.filter(
                            (option) => {
                              const typedOption = option as ProductOption;
                              return (
                                typedOption.isAvailable ||
                                productsSelected.some(
                                  (p) => p.value === option.value,
                                )
                              );
                            },
                          );
                          const orderItems = validOptions.map((option) => ({
                            productId: option.value,
                            quantity: quantities[option.value] || 1,
                          }));
                          field.onChange(orderItems);
                          setProductsSelected(validOptions as ProductOption[]);
                          return;
                        }

                        const orderItems = selectedOptions.map((option) => ({
                          productId: option.value,
                          quantity: quantities[option.value] || 1,
                        }));
                        field.onChange(orderItems);
                        setProductsSelected(selectedOptions as ProductOption[]);
                      }}
                      values={productsSelected}
                      multiSelect
                      disabled={loading}
                    />
                  </FormControl>
                  <FormMessage />
                  {productsSelected.some((p) => !p.isAvailable) && (
                    <div className="flex items-center gap-1 text-sm text-warning">
                      <AlertTriangle className="h-4 w-4" />
                      Algunos productos de esta orden ya no están disponibles
                    </div>
                  )}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usuario</FormLabel>
                  <FormControl>
                    <UserCombobox
                      options={users}
                      value={field.value}
                      onChange={(value, user) => {
                        field.onChange(value);
                        if (user) {
                          form.setValue("fullName", user.label);
                          form.setValue("documentId", user.documentId ?? "");
                          form.setValue("phone", user.phone ?? "");
                          form.setValue("email", user.documentId ?? "");
                        }
                      }}
                      disabled={loading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="guestId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Id de invitado</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      readOnly
                      placeholder="Id de invitado"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Nombre completo"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="documentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Documento de identidad</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Documento de identidad"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo electrónico</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Correo electrónico"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-x-1">
                      {(initialData || field.value.length >= 10) && (
                        <WhatsappButton
                          order={{
                            orderNumber: initialData?.orderNumber ?? "",
                            status: initialData?.status ?? OrderStatus.CREATED,
                            fullName:
                              initialData?.fullName ?? form.watch("fullName"),
                            phone: field.value,
                            totalPrice: orderTotals.total,
                            products: productsSelected.map((product) => ({
                              name: product.label,
                              quantity: quantities[product.value] || 1,
                            })),
                          }}
                          size="md"
                        />
                      )}
                      <Input
                        disabled={loading}
                        placeholder="Número de teléfono"
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
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Dirección"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado de la orden</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un estado para la orden"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(OrderStatus).map((state) => (
                        <SelectItem key={state} value={state}>
                          {statusOptions[state]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Descuentos y Cupones</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                form.resetField("discount.type");
                form.resetField("discount.amount", {
                  defaultValue: 0,
                });
                form.resetField("discount.reason", {
                  defaultValue: "",
                });
                toast({
                  description: "Descuentos eliminados",
                  variant: "success",
                });
              }}
            >
              <Trash className="mr-2 h-4 w-4" />
              Limpiar descuentos
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
            <FormField
              control={form.control}
              name="discount.type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de descuento</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value || ""}
                  >
                    <FormControl>
                      <SelectTrigger value={field.value}>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={DiscountType.PERCENTAGE}>
                        {discountOptions[DiscountType.PERCENTAGE]}
                      </SelectItem>
                      <SelectItem value={DiscountType.FIXED}>
                        {discountOptions[DiscountType.FIXED]}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="discount.amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto del descuento</FormLabel>
                  <FormControl>
                    <div className="relative">
                      {form.watch("discount.type") ===
                      DiscountType.PERCENTAGE ? (
                        <Percent className="absolute left-3 top-3 h-4 w-4" />
                      ) : (
                        <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      )}
                      <Input
                        type="number"
                        disabled={loading || !form.watch("discount.type")}
                        className="pl-8"
                        placeholder={
                          form.watch("discount.type") ===
                          DiscountType.PERCENTAGE
                            ? "10"
                            : "10000"
                        }
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="discount.reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razón del descuento</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={loading || !form.watch("discount.type")}
                      placeholder="Ej: Promoción especial"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="couponCode"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="flex items-center gap-2">
                    Cupón
                    {coupon && (
                      <Badge
                        variant="success"
                        className="flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        Aplicado
                      </Badge>
                    )}
                  </FormLabel>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            disabled={validatingCoupon || loading}
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            <div className="flex items-center gap-2 font-mono">
                              <Ticket
                                className={cn(
                                  "h-4 w-4",
                                  coupon
                                    ? "text-success"
                                    : "text-muted-foreground",
                                )}
                              />
                              {field.value
                                ? availableCoupons.find(
                                    (c) => c.code === field.value,
                                  )?.code || field.value
                                : availableCoupons.length > 0
                                  ? "Seleccionar cupón"
                                  : "No hay cupones disponibles"}
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      {availableCoupons.length > 0 && (
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                          <Command>
                            <CommandInput placeholder="Buscar cupón..." />
                            <CommandEmpty>
                              No se encontraron cupones.
                            </CommandEmpty>
                            <CommandGroup>
                              {availableCoupons.map((c) => (
                                <CommandItem
                                  key={c.code}
                                  value={c.code}
                                  onSelect={async () => {
                                    try {
                                      setValidatingCoupon(true);
                                      if (
                                        !initialData?.coupon ||
                                        initialData.coupon.code !== c.code
                                      ) {
                                        const response = await axios.post(
                                          `/api/${params.storeId}/coupons/validate`,
                                          {
                                            code: c.code,
                                            subtotal: orderTotals.subtotal,
                                          },
                                        );
                                        setCoupon(response.data);
                                      } else {
                                        setCoupon(initialData.coupon);
                                      }
                                      field.onChange(c.code);
                                      toast({
                                        description:
                                          "Cupón aplicado correctamente",
                                        variant: "success",
                                      });
                                    } catch (error) {
                                      toast({
                                        description: getErrorMessage(error),
                                        variant: "destructive",
                                      });
                                      setCoupon(null);
                                      field.onChange("");
                                    } finally {
                                      setValidatingCoupon(false);
                                    }
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      c.code === field.value
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  <div className="flex w-full items-center justify-between">
                                    <span className="font-mono">{c.code}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {c.type === DiscountType.PERCENTAGE
                                        ? `${c.amount}% de descuento`
                                        : `${currencyFormatter.format(Number(c.amount))} de descuento`}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      )}
                    </Popover>
                    {coupon && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className=""
                        onClick={() => {
                          setCoupon(null);
                          field.onChange("");
                          toast({
                            description: "Cupón removido",
                            variant: "success",
                          });
                        }}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Separator />
          <h2 className="text-lg font-semibold">
            Estado del pago # {initialData?.payment?.id}
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
            <FormField
              control={form.control}
              name="payment.method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de pago</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un método de pago"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(PaymentMethod).map((state) => (
                        <SelectItem key={state} value={state}>
                          {paymentOptions[state]}
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
              name="payment.transactionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de la transacción</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Número de la transacción (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {initialData?.payment?.details && (
              <FormItem className="flex w-full flex-col">
                <FormLabel>Detalles del pago</FormLabel>
                <Alert className="max-w-full">
                  <AlertDescription>
                    <div className="flex w-full flex-col">
                      {Object.entries(parsedDetails).map(([key, value]) => {
                        const currentPaymentMethodObject =
                          paymentMethodsByOption[
                            initialData?.payment?.method as PaymentMethod
                          ];
                        return (
                          <div
                            key={key}
                            className="flex w-full flex-col text-sm"
                          >
                            <span className="font-semibold">
                              {detailsTitleOptions[key] || key}
                            </span>
                            <span>
                              {currentPaymentMethodObject?.[value] || value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </AlertDescription>
                </Alert>
              </FormItem>
            )}
          </div>
          <Separator />
          <h2 className="text-lg font-semibold">
            Estado del envío # {initialData?.shipping?.id}
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            <FormField
              control={form.control}
              name="shipping.status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado del envío</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un estado para el envío"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(ShippingStatus).map((state) => (
                        <SelectItem key={state} value={state}>
                          {shippingOptions[state]}
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
              name="shipping.courier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la transportadora</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Empresa (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.cost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Costo</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="10000 (opcional)"
                        className="pl-8"
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
              name="shipping.trackingCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de guía</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Guía (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
