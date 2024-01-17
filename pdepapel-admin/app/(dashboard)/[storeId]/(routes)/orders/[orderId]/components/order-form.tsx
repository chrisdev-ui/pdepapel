"use client";

import {
  Order,
  OrderItem,
  OrderStatus,
  PaymentDetails,
  PaymentMethod,
  Shipping,
  ShippingStatus,
} from "@prisma/client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AutoComplete } from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatter, generateGuestId, parseOrderDetails } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { DollarSign, ShoppingBasket, Trash } from "lucide-react";
import { useForm } from "react-hook-form";

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

const formSchema = z.object({
  userId: z.string().default(""),
  guestId: z.string().default(""),
  fullName: z.string().min(1, "Debes agregar un nombre"),
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
});

type OrderFormValues = z.infer<typeof formSchema>;

type ProductOption = {
  value: string;
  label: string;
  price?: number;
};

type WompiPaymentMethods = {
  [key in
    | "CARD"
    | "BANCOLOMBIA_TRANSFER"
    | "BANCOLOMBIA_QR"
    | "NEQUI"
    | "PSE"
    | "PCOL"
    | string]: string;
};

interface OrderFormProps {
  initialData:
    | (Order & {
        orderItems: OrderItem[];
        payment: PaymentDetails | null;
        shipping: Shipping | null;
      })
    | null;
  products: ProductOption[];
}

export const OrderForm: React.FC<OrderFormProps> = ({
  initialData,
  products,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [productsSelected, setProductsSelected] = useState<ProductOption[]>(
    initialData
      ? (initialData.orderItems
          .map((item) =>
            products.find((product) => product.value === item.productId),
          )
          .filter(Boolean) as ProductOption[])
      : [],
  );
  const [totalPrice, setTotalPrice] = useState(
    initialData
      ? initialData.orderItems.reduce(
          (sum, item) =>
            sum +
            (products.find((product) => product.value === item.productId)
              ?.price || 0) *
              (item.quantity || 1),
          0,
        )
      : 0,
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
  const [loading, setLoading] = useState(false);

  const statusOptions = {
    [OrderStatus.CREATED]: "Creada",
    [OrderStatus.PENDING]: "Pendiente",
    [OrderStatus.PAID]: "Pagada",
    [OrderStatus.CANCELLED]: "Cancelada",
  };

  const paymentOptions = {
    [PaymentMethod.BankTransfer]: "Transferencia bancaria",
    [PaymentMethod.COD]: "Contra entrega",
    [PaymentMethod.PayU]: "PayU",
    [PaymentMethod.Wompi]: "Wompi",
  };

  const shippingOptions = {
    [ShippingStatus.Preparing]: "En preparación",
    [ShippingStatus.Shipped]: "Enviada",
    [ShippingStatus.InTransit]: "En tránsito",
    [ShippingStatus.Delivered]: "Entregada",
    [ShippingStatus.Returned]: "Devuelta",
  };

  const detailsTitleOptions: { [key: string]: string } = {
    customer_email: "Correo electrónico del cliente",
    payment_method_type: "Tipo de método de pago",
    reference_pol: "Número de orden",
  };

  const paymentMethodsByOption: {
    [P in PaymentMethod]: WompiPaymentMethods | null;
  } = {
    [PaymentMethod.Wompi]: {
      CARD: "Tarjeta de crédito",
      BANCOLOMBIA_TRANSFER: "Transferencia bancaria Bancolombia",
      BANCOLOMBIA_QR: "Código QR",
      NEQUI: "Nequi",
      PSE: "PSE",
      PCOL: "Puntos Colombia",
    },
    [PaymentMethod.PayU]: null,
    [PaymentMethod.BankTransfer]: null,
    [PaymentMethod.COD]: null,
  };

  const title = initialData ? "Editar orden" : "Crear orden";
  const description = initialData
    ? "Editar una orden"
    : "Crear una nueva orden";
  const toastMessage = initialData ? "Orden actualizada" : "Orden creada";
  const action = initialData ? "Guardar cambios" : "Crear";

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          userId: initialData.userId || "",
          guestId: initialData.guestId || "",
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
          address: "",
          status: OrderStatus.CREATED,
          payment: {},
          shipping: {},
        },
  });

  const onSubmit = async (data: OrderFormValues) => {
    try {
      setLoading(true);
      const updatedOrderItems = data.orderItems.map((item) => ({
        ...item,
        quantity: quantities[item.productId] || item.quantity,
      }));

      const updatedData = {
        ...data,
        orderItems: updatedOrderItems,
      };
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/orders/${params.orderId}`,
          updatedData,
        );
      } else {
        await axios.post(`/api/${params.storeId}/orders`, updatedData);
      }
      router.refresh();
      router.push(`/${params.storeId}/orders`);
      toast({
        description: toastMessage,
        variant: "success",
      });
    } catch (error) {
      toast({
        description:
          "¡Ups! Algo salió mal. Por favor, verifica tu conexión e inténtalo nuevamente más tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/orders/${params.orderId}`);
      router.refresh();
      router.push(`/${params.storeId}/orders`);
      toast({
        description: "Orden eliminada",
        variant: "success",
      });
    } catch (error) {
      toast({
        description:
          "¡Ups! Algo salió mal. Por favor, verifica tu conexión e inténtalo nuevamente más tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const parsedDetails = parseOrderDetails(initialData?.payment?.details);

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
                  <ShoppingBasket className="h-4 w-4" />
                  <AlertTitle>{product.label}</AlertTitle>
                  <AlertDescription>
                    {formatter.format(product.price || 0)} x{" "}
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
                        const newTotal = productsSelected.reduce(
                          (sum, option) => {
                            const quantity =
                              option.value === product.value
                                ? newQuantity
                                : quantities[option.value] || 1;
                            return sum + Number(option?.price) * quantity;
                          },
                          0,
                        );
                        setTotalPrice(newTotal);
                      }}
                    />
                  </AlertDescription>
                </Alert>
              ))}
            <div className="ml-auto text-lg font-semibold">
              Total: {formatter.format(totalPrice)}
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
                        const orderItems = selectedOptions.map((option) => ({
                          productId: option.value,
                          quantity: quantities[option.value] || 1,
                        }));
                        field.onChange(orderItems);
                        setProductsSelected(selectedOptions);
                        const newTotal = selectedOptions.reduce(
                          (sum, option) =>
                            sum +
                            Number(option?.price) *
                              (quantities[option.value] || 1),
                          0,
                        );
                        setTotalPrice(newTotal);
                      }}
                      values={
                        field.value.map((item) => ({
                          ...products.find(
                            (product) => product.value === item.productId,
                          ),
                          quantity: item.quantity,
                        })) as ProductOption[]
                      }
                      multiSelect
                      disabled={loading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Id del usuario</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Id del usuario"
                      {...field}
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
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Número de teléfono"
                      {...field}
                    />
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
