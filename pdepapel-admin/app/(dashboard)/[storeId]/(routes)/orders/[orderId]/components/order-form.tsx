"use client";

import {
  Coupon,
  DiscountType,
  OrderStatus,
  PaymentMethod,
  ShippingProvider,
  ShippingStatus,
} from "@prisma/client";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { GuideConfirmationModal } from "@/components/modals/guide-confirmation-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AutoComplete } from "@/components/ui/autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Label } from "@/components/ui/label";
import {
  LocationCombobox,
  LocationOption,
} from "@/components/ui/location-combobox";
import { OrderStatusSelector } from "@/components/ui/order-status-selector";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Models,
  detailsTitleOptions,
  discountOptions,
  paymentMethodsByOption,
  paymentOptions,
  shippingOptions,
} from "@/constants";
import { ENVIOCLICK_LIMITS, getCarrierInfo } from "@/constants/shipping";
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
  Loader2,
  Package,
  Percent,
  RefreshCw,
  Store,
  Ticket,
  Trash,
  Truck,
  Wallet,
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
    carrierName: z.string(),
    productName: z.string(),
    flete: z.coerce.number(),
    minimumInsurance: z.coerce.number(),
    deliveryDays: z.coerce.number(),
    isCOD: z.boolean(),
    cost: z.coerce.number(),
    trackingCode: z.string(),
    trackingUrl: z.string().optional(),
    guideUrl: z.string().optional(),
    estimatedDeliveryDate: z
      .date({
        required_error: "La fecha de inicio es requerida",
        invalid_type_error: "La fecha de inicio debe ser una fecha válida",
      })
      .optional(),
    notes: z.string().optional(),
  })
  .partial();

const discountSchema = z
  .object({
    type: z.nativeEnum(DiscountType),
    amount: z.coerce.number().min(0),
    reason: z.string(),
  })
  .partial();

const formSchema = z
  .object({
    userId: z.string().default(""),
    guestId: z.string().default(""),
    fullName: z
      .string()
      .min(1, "Debes agregar un nombre")
      .max(50, "El nombre completo no puede exceder 50 caracteres"),
    email: z
      .string()
      .min(1, "El correo electrónico es requerido")
      .email("Debes agregar un correo electrónico válido")
      .max(
        ENVIOCLICK_LIMITS.email.max,
        `El correo no puede exceder ${ENVIOCLICK_LIMITS.email.max} caracteres`,
      ),
    phone: z
      .string()
      .min(10, "El número telefónico debe tener 10 dígitos")
      .max(10, "El número telefónico debe tener 10 dígitos")
      .regex(/^\d+$/, "Solo se permiten números"),
    address: z
      .string()
      .min(1, "Debes agregar una dirección")
      .max(
        ENVIOCLICK_LIMITS.address.max,
        `La dirección no puede exceder ${ENVIOCLICK_LIMITS.address.max} caracteres`,
      ),
    city: z.string().optional(),
    department: z.string().optional(),
    daneCode: z.string().optional(),
    neighborhood: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.suburb.max,
        `El barrio no puede exceder ${ENVIOCLICK_LIMITS.suburb.max} caracteres`,
      )
      .optional(),
    addressReference: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.reference.max,
        `La referencia no puede exceder ${ENVIOCLICK_LIMITS.reference.max} caracteres`,
      )
      .optional(),
    address2: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.crossStreet.max,
        `La intersección no puede exceder ${ENVIOCLICK_LIMITS.crossStreet.max} caracteres`,
      )
      .optional(),
    company: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.company.max,
        `La empresa no puede exceder ${ENVIOCLICK_LIMITS.company.max} caracteres`,
      )
      .optional(),
    orderItems: z
      .array(
        z.object({ productId: z.string(), quantity: z.coerce.number().min(1) }),
      )
      .nonempty({ message: "Debes agregar al menos 1 producto" }),
    status: z.nativeEnum(OrderStatus),
    payment: paymentSchema,
    shipping: shippingSchema,
    shippingProvider: z
      .nativeEnum(ShippingProvider)
      .default(ShippingProvider.NONE),
    envioClickIdRate: z.number().optional(),
    documentId: z.string().default(""),
    subtotal: z.coerce.number().default(0),
    total: z.coerce.number().default(0),
    discount: discountSchema,
    couponCode: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.shippingProvider === "ENVIOCLICK") {
        return !!(data.city && data.department && data.daneCode);
      }
      return true;
    },
    {
      message:
        "Ciudad, departamento y código DANE son requeridos para EnvioClick",
      path: ["daneCode"],
    },
  );

type OrderFormValues = z.infer<typeof formSchema>;

interface ShippingQuote {
  idRate: number;
  carrier: string;
  product: string;
  flete: number;
  minimumInsurance: number;
  totalCost: number;
  deliveryDays: string | number;
  isCOD: boolean;
}

interface OrderFormProps {
  initialData: GetOrderResult["order"];
  products: ProductOption[];
  availableCoupons: Awaited<ReturnType<typeof getCoupons>>;
  users: {
    value: string;
    label: string;
    image?: string;
  }[];
  locations: LocationOption[];
}

export const OrderForm: React.FC<OrderFormProps> = ({
  initialData,
  products,
  availableCoupons,
  users,
  locations,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<number | null>(
    initialData?.shipping?.envioClickIdRate || null,
  );

  const [showGuideConfirmation, setShowGuideConfirmation] = useState(false);

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

  const { title, description, toastMessage, action, pendingText } = useMemo(
    () => ({
      title: initialData ? "Editar orden" : "Crear orden",
      description: initialData ? "Editar una orden" : "Crear una nueva orden",
      toastMessage: initialData ? "Orden actualizada" : "Orden creada",
      action: initialData ? "Guardar cambios" : "Crear",
      pendingText: initialData ? "Actualizando..." : "Creando...",
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
          address: initialData.address || "",
          city: initialData.city || "",
          department: initialData.department || "",
          daneCode: initialData.daneCode || "",
          neighborhood: initialData.neighborhood || "",
          addressReference: initialData.addressReference || "",
          address2: initialData.address2 || "",
          company: initialData.company || "",
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
          shippingProvider:
            initialData.shipping?.provider || ShippingProvider.NONE,
          envioClickIdRate: initialData.shipping?.envioClickIdRate || undefined,
          shipping: {
            ...initialData.shipping,
            status: initialData.shipping?.status || ShippingStatus.Preparing,
            courier: initialData.shipping?.courier || undefined,
            carrierName: initialData.shipping?.carrierName || undefined,
            productName: initialData.shipping?.productName || undefined,
            flete: initialData.shipping?.flete || undefined,
            minimumInsurance:
              initialData.shipping?.minimumInsurance || undefined,
            deliveryDays: initialData.shipping?.deliveryDays || undefined,
            isCOD: initialData.shipping?.isCOD || false,
            trackingCode: initialData.shipping?.trackingCode || undefined,
            trackingUrl: initialData.shipping?.trackingUrl || undefined,
            guideUrl: initialData.shipping?.guideUrl || undefined,
            cost: initialData.shipping?.cost || 0,
            estimatedDeliveryDate:
              initialData.shipping?.estimatedDeliveryDate || undefined,
            notes: initialData.shipping?.notes || undefined,
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
          city: "",
          department: "",
          daneCode: "",
          neighborhood: "",
          addressReference: "",
          address2: "",
          company: "",
          documentId: "",
          status: OrderStatus.CREATED,
          payment: {},
          shippingProvider: ShippingProvider.NONE,
          envioClickIdRate: undefined,
          shipping: {
            status: ShippingStatus.Preparing,
            courier: "",
            carrierName: "",
            productName: "",
            flete: 0,
            minimumInsurance: 0,
            deliveryDays: 0,
            isCOD: false,
            trackingCode: "",
            trackingUrl: "",
            guideUrl: "",
            cost: 0,
            estimatedDeliveryDate: undefined,
            notes: undefined,
          },
          subtotal: 0,
          total: 0,
          discount: {},
          couponCode: "",
        },
  });

  const discountType = form.watch("discount.type");
  const discountAmount = form.watch("discount.amount");
  const shippingCost = form.watch("shipping.cost");
  const shippingCourier = form.watch("shipping.courier");
  const shippingCarrierName = form.watch("shipping.carrierName");

  const carrierInfo = useMemo(() => {
    return getCarrierInfo(shippingCarrierName || shippingCourier || "");
  }, [shippingCarrierName, shippingCourier]);

  const {
    formState: { isDirty },
  } = form;

  const orderTotals = useMemo(() => {
    // Calculate subtotal from selected products using discounted prices
    const subtotal = productsSelected.reduce(
      (sum, product) =>
        sum +
        Number(product.discountedPrice) * (quantities[product.value] || 1),
      0,
    );

    // Calculate offer savings (difference between original and discounted prices)
    const offerSavings = productsSelected.reduce(
      (sum, product) =>
        sum +
        (Number(product.price) - Number(product.discountedPrice)) *
          (quantities[product.value] || 1),
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

    // Include shipping cost in total calculation
    const shipping = Number(shippingCost) || 0;
    const total = Math.max(
      0,
      subtotal - discountValue - couponDiscount + shipping,
    );

    return {
      subtotal,
      offerSavings,
      discount: discountValue,
      couponDiscount,
      total,
    };
  }, [
    productsSelected,
    quantities,
    discountType,
    discountAmount,
    coupon,
    shippingCost,
  ]);

  const onSubmit = async (data: OrderFormValues) => {
    try {
      setLoading(true);

      // Check if order will be PAID with ENVIOCLICK and has selected rate
      const willBePaid = data.status === "PAID";
      const hasEnvioClickRate =
        data.shippingProvider === "ENVIOCLICK" && data.envioClickIdRate;
      const hasGuideAlready = initialData?.shipping?.envioClickIdOrder;

      if (willBePaid && hasEnvioClickRate && !hasGuideAlready) {
        // Show confirmation modal for guide creation
        setShowGuideConfirmation(true);
        setLoading(false);
        return; // Don't submit yet, wait for confirmation
      }

      // Normal submission
      await submitOrder(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const submitOrder = async (data: OrderFormValues, forceRedirect = true) => {
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

    let response;
    if (initialData) {
      response = await axios.patch(
        `/api/${params.storeId}/${Models.Orders}/${params.orderId}`,
        payload,
      );
    } else {
      response = await axios.post(
        `/api/${params.storeId}/${Models.Orders}`,
        payload,
      );
    }
    if (forceRedirect) {
      const guideCreation = response.data.guideCreation;

      if (guideCreation?.attempted) {
        if (guideCreation.success) {
          toast({
            title: "Éxito",
            description: "Orden creada y guía generada exitosamente.",
            variant: "success",
          });
        } else {
          toast({
            title: "Atención",
            description:
              "Orden creada, pero falló la generación de la guía. Por favor créala manualmente.",
            variant: "warning",
          });
        }
      } else {
        toast({
          description: toastMessage,
          variant: "success",
        });
      }

      router.push(`/${params.storeId}/${Models.Orders}`);
    }
  };

  const confirmAndCreateGuide = async () => {
    try {
      setLoading(true);
      const data = form.getValues();

      await submitOrder(data, false);

      setShowGuideConfirmation(false);

      toast({
        title: "Orden guardada y guía creada",
        description: "La guía de envío se creará automáticamente",
      });

      router.push(`/${params.storeId}/${Models.Orders}`);
    } catch (error) {
      toast({
        title: "Error",
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

  const onGetShippingQuotes = async () => {
    const formData = form.getValues();

    if (!formData.city || !formData.department || !formData.daneCode) {
      toast({
        title: "Error",
        description:
          "Debes seleccionar una ciudad con el buscador para cotizar",
        variant: "destructive",
      });
      return;
    }

    if (formData.orderItems.length === 0) {
      toast({
        title: "Error",
        description: "Debes agregar al menos un producto al pedido",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoadingQuotes(true);
      const response = await axios.post(
        `/api/${params.storeId}/shipment/quote`,
        {
          destination: {
            daneCode: formData.daneCode || "",
            address: formData.address || "",
          },
          orderTotal: orderTotals.total,
          items: formData.orderItems.map((item) => ({
            ...item,
            quantity: quantities[item.productId] || item.quantity,
          })),
          forceRefresh: true,
        },
      );

      setShippingQuotes(response.data.quotes);

      if (response.data.quotes.length === 0) {
        toast({
          title: "Sin resultados",
          description:
            "No se encontraron tarifas disponibles para esta ubicación",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Cotización exitosa",
          description: `Se encontraron ${response.data.quotes.length} tarifas disponibles`,
        });
      }
    } catch (error) {
      toast({
        title: "Error al cotizar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoadingQuotes(false);
    }
  };

  const handleSelectRate = (quote: ShippingQuote) => {
    setSelectedRateId(quote.idRate);

    // Update form with selected rate data
    form.setValue("shippingProvider", "ENVIOCLICK");
    form.setValue("envioClickIdRate", quote.idRate);

    // Store all quotation data including carrier info for guide creation
    form.setValue("shipping", {
      carrierName: quote.carrier,
      courier: quote.carrier, // Set both for compatibility
      productName: quote.product,
      flete: quote.flete,
      minimumInsurance: quote.minimumInsurance,
      deliveryDays:
        typeof quote.deliveryDays === "string"
          ? parseInt(quote.deliveryDays)
          : quote.deliveryDays,
      isCOD: quote.isCOD,
      cost: quote.totalCost,
      status: ShippingStatus.Preparing,
    } as any);

    toast({
      title: "Tarifa seleccionada",
      description: `${quote.carrier} - ${currencyFormatter.format(quote.totalCost)}`,
    });
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
      <GuideConfirmationModal
        isOpen={showGuideConfirmation}
        onClose={() => setShowGuideConfirmation(false)}
        onConfirm={confirmAndCreateGuide}
        loading={loading}
        selectedQuote={
          shippingQuotes.find((q) => q.idRate === selectedRateId) || {
            idRate: form.getValues("envioClickIdRate") || 0,
            carrier: form.getValues("shipping.carrierName") || "",
            product: form.getValues("shipping.productName") || "",
            flete: form.getValues("shipping.flete") || 0,
            minimumInsurance: form.getValues("shipping.minimumInsurance") || 0,
            totalCost: form.getValues("shipping.cost") || 0,
            deliveryDays: form.getValues("shipping.deliveryDays") || 0,
            isCOD: form.getValues("shipping.isCOD") || false,
          }
        }
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
          autoComplete="off"
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
                        <div className="flex flex-col gap-1">
                          {product.offerLabel && (
                            <Badge
                              variant="secondary"
                              className="w-fit text-xs"
                            >
                              {product.offerLabel}
                            </Badge>
                          )}
                          <div className="flex items-center gap-2">
                            {product.discountedPrice < product.price ? (
                              <>
                                <span className="text-xs text-muted-foreground line-through">
                                  {currencyFormatter.format(product.price)}
                                </span>
                                <span className="font-semibold text-green-600">
                                  {currencyFormatter.format(
                                    product.discountedPrice,
                                  )}
                                </span>
                              </>
                            ) : (
                              <span>
                                {currencyFormatter.format(product.price || 0)}
                              </span>
                            )}
                            <span>×</span>
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
                          </div>
                        </div>
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              ))}
          </div>
          {/* Totals */}
          <div className="ml-auto flex flex-col space-y-2 text-right">
            <div className="text-lg font-semibold">
              Subtotal: {currencyFormatter.format(orderTotals.subtotal)}
            </div>
            {orderTotals.offerSavings > 0 && (
              <div className="text-lg text-green-600">
                Ahorro por ofertas: -
                {currencyFormatter.format(orderTotals.offerSavings)}
              </div>
            )}
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
            {Number(shippingCost || 0) > 0 && (
              <div className="text-lg text-primary">
                Envío: +{currencyFormatter.format(Number(shippingCost || 0))}
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
                  <FormLabel isRequired>Lista de Productos</FormLabel>
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
                  <FormLabel isRequired>Nombre</FormLabel>
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
                  <FormLabel isRequired>Teléfono</FormLabel>
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
              name="daneCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>
                    Ciudad y Departamento
                    <span className="ml-2 text-xs text-muted-foreground">
                      (Requerido para cotización de envío)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <LocationCombobox
                      options={locations}
                      value={field.value || ""}
                      onChange={(value, location) => {
                        field.onChange(value);
                        if (location) {
                          form.setValue("city", location.city);
                          form.setValue("department", location.department);
                        }
                      }}
                      disabled={loading}
                      placeholder="Buscar ciudad..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Bogotá"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Departamento</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Cundinamarca"
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
                  <FormLabel isRequired>Dirección</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Calle 123 #45-67"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección 2</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Apto 501, Torre B"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="neighborhood"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barrio (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Laureles"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="addressReference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia de dirección</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={loading}
                      placeholder="Ej: Frente al parque, edificio azul"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Acme Corp"
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
                <FormItem className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                  <FormLabel isRequired>Estado de la orden</FormLabel>
                  <FormDescription>
                    Selecciona el estado actual de la orden
                  </FormDescription>
                  <FormControl>
                    <OrderStatusSelector
                      currentStatus={field.value}
                      onStatusChange={field.onChange}
                      readOnly={loading}
                      className="py-4"
                    />
                  </FormControl>
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
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-5 w-5" />
            Estado del pago{" "}
            {initialData?.payment?.transactionId
              ? `# (${initialData?.payment?.transactionId})`
              : ""}
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
                      placeholder="000-000000-000"
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
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Package className="h-5 w-5" />
            Información de envío{" "}
            {initialData?.shipping?.envioClickIdOrder
              ? `# (${initialData?.shipping?.envioClickIdOrder})`
              : ""}
          </h2>
          <div className="grid grid-cols-1 gap-8">
            <FormField
              control={form.control}
              name="shippingProvider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Tipo de Envío</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      defaultValue={ShippingProvider.NONE}
                      className="grid grid-cols-1 gap-4 md:grid-cols-3"
                      disabled={
                        loading || !!initialData?.shipping?.envioClickIdOrder
                      }
                    >
                      {/* NONE - Store Pickup */}
                      <Label
                        htmlFor="none"
                        className={cn("cursor-pointer transition-all")}
                      >
                        <Card className="h-full hover:border-primary/50">
                          <CardContent className="flex items-start gap-3 p-5">
                            <RadioGroupItem
                              value={ShippingProvider.NONE}
                              id="none"
                              className="mt-0.5"
                            />
                            <div className="flex flex-1 flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <Store className="h-5 w-5 text-primary" />
                                <span className="font-semibold">
                                  Recoger en tienda
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                El cliente recogerá el pedido en la ubicación
                                física
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Label>

                      {/* ENVIOCLICK - Integrated Shipping */}
                      <Label
                        htmlFor="envioclick"
                        className={cn(
                          "cursor-pointer transition-all",
                          field.value === ShippingProvider.ENVIOCLICK &&
                            "ring-2 ring-white ring-offset-2",
                        )}
                      >
                        <Card className="h-full overflow-hidden hover:border-blue-400">
                          <CardContent className="flex items-start gap-3 rounded-md p-5 text-white [background:linear-gradient(135deg,#010019,#020a47)]">
                            <RadioGroupItem
                              value={ShippingProvider.ENVIOCLICK}
                              id="envioclick"
                              className="mt-0.5 border-white text-white"
                            />
                            <div className="flex flex-1 flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Image
                                  src="https://www.envioclickpro.com.co/img/register/logo_solo.svg"
                                  alt="EnvíoClick"
                                  width={100}
                                  height={32}
                                  className="h-8 w-auto object-contain"
                                />
                              </div>
                              <span className="text-xs text-blue-100">
                                Transportadora integrada para envíos nacionales
                                con múltiples opciones
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Label>

                      {/* MANUAL - Other Carriers */}
                      <Label
                        htmlFor="manual"
                        className={cn(
                          "cursor-pointer transition-all",
                          field.value === ShippingProvider.MANUAL &&
                            "ring-2 ring-primary ring-offset-2",
                        )}
                      >
                        <Card className="h-full hover:border-primary/50">
                          <CardContent className="flex items-start gap-3 p-5">
                            <RadioGroupItem
                              value={ShippingProvider.MANUAL}
                              id="manual"
                              className="mt-0.5"
                            />
                            <div className="flex flex-1 flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <Truck className="h-5 w-5 text-primary" />
                                <span className="font-semibold">
                                  Envío Manual
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Usar otra transportadora o servicio de
                                mensajería personalizado
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* EnvioClick Quotation Section */}
            {form.watch("shippingProvider") === ShippingProvider.ENVIOCLICK && (
              <div className="space-y-4">
                {/* Quote Button */}
                <Button
                  type="button"
                  onClick={onGetShippingQuotes}
                  disabled={
                    loadingQuotes ||
                    !form.watch("city") ||
                    !form.watch("daneCode") ||
                    !!initialData?.shipping?.envioClickIdOrder
                  }
                  className="w-full text-white [background:linear-gradient(90deg,#010019,#020a47)] hover:brightness-105"
                >
                  {loadingQuotes && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {loadingQuotes
                    ? "Cotizando..."
                    : "Obtener Cotizaciones de Envío"}
                </Button>

                {/* Rates Display */}
                {shippingQuotes.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Selecciona una tarifa:</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onGetShippingQuotes}
                        disabled={loadingQuotes}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>

                    <RadioGroup
                      value={selectedRateId?.toString() || ""}
                      defaultValue={selectedRateId?.toString() || undefined}
                      onValueChange={(value) => {
                        const quote = shippingQuotes.find(
                          (q) => q.idRate === parseInt(value),
                        );
                        if (quote) handleSelectRate(quote);
                      }}
                      className="space-y-3"
                    >
                      {shippingQuotes.map((quote) => {
                        const carrierInfo = getCarrierInfo(quote.carrier);
                        const bgColor = carrierInfo?.color || "#FFFFFF";
                        return (
                          <div key={quote.idRate} className="relative">
                            <RadioGroupItem
                              value={quote.idRate.toString()}
                              id={`rate-${quote.idRate}`}
                              className="peer sr-only"
                              disabled={
                                !!initialData?.shipping?.envioClickIdOrder
                              }
                            />
                            <Label
                              htmlFor={`rate-${quote.idRate}`}
                              className={cn(
                                "flex cursor-pointer flex-col rounded-lg border-2 p-4 transition-all",
                                selectedRateId === quote.idRate
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/50",
                                !!initialData?.shipping?.envioClickIdOrder &&
                                  "cursor-not-allowed opacity-50",
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                {/* Carrier Logo with Brand Color */}
                                <div className="flex flex-1 items-center gap-3">
                                  {carrierInfo && (
                                    <div
                                      className="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-md p-2"
                                      style={{ backgroundColor: bgColor }}
                                    >
                                      <Image
                                        src={carrierInfo.logoUrl}
                                        alt={carrierInfo.comercialName}
                                        width={64}
                                        height={32}
                                        className="h-full w-full object-contain"
                                      />
                                    </div>
                                  )}

                                  <div className="flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold">
                                        {quote.carrier}
                                      </span>
                                      {quote.isCOD && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          Contra entrega
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {quote.product}
                                    </p>
                                    <div className="flex items-center gap-4 text-sm">
                                      <span className="text-muted-foreground">
                                        Entrega aprox. {quote.deliveryDays}{" "}
                                        {quote.deliveryDays === 1
                                          ? "día"
                                          : "días"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                {/* Price Section */}
                                <div className="flex-shrink-0 space-y-1 text-right">
                                  <p className="text-2xl font-bold">
                                    {currencyFormatter.format(quote.totalCost)}
                                  </p>
                                  <div className="space-y-0.5 text-xs text-muted-foreground">
                                    <p>
                                      Flete:{" "}
                                      {currencyFormatter.format(quote.flete)}
                                    </p>
                                    <p>
                                      Seguro:{" "}
                                      {currencyFormatter.format(
                                        quote.minimumInsurance,
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </Label>
                          </div>
                        );
                      })}
                    </RadioGroup>

                    {selectedRateId && (
                      <Alert>
                        <AlertDescription>
                          <Check className="inline h-4 w-4 text-green-500" />{" "}
                          Tarifa seleccionada.{" "}
                          {form.watch("status") === "PAID"
                            ? "Al guardar se creará automáticamente la guía de envío."
                            : "Cambia el estado a PAGADO para crear la guía de envío."}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Guide already created warning */}
                {initialData?.shipping?.envioClickIdOrder && (
                  <Alert>
                    <AlertDescription>
                      Esta orden ya tiene una guía de EnvioClick creada. Los
                      datos de envío no se pueden modificar.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Manual Shipping Info */}
            {form.watch("shippingProvider") === "MANUAL" && (
              <div className="space-y-4 rounded-lg bg-muted/50 p-4">
                <Alert>
                  <AlertDescription>
                    Completa los datos del envío con una transportadora que no
                    está en EnvioClick.
                  </AlertDescription>
                </Alert>

                {/* Carrier Name */}
                <FormField
                  control={form.control}
                  name="shipping.carrierName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Transportadora</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: Servientrega, TCC, Coordinadora"
                          disabled={loading}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tracking Code */}
                <FormField
                  control={form.control}
                  name="shipping.trackingCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Guía</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: SER123456789"
                          disabled={loading}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Código de seguimiento de la transportadora
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tracking URL */}
                <FormField
                  control={form.control}
                  name="shipping.trackingUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL de Rastreo</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: https://..."
                          disabled={loading}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Guide URL */}
                <FormField
                  control={form.control}
                  name="shipping.guideUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL de la Guía (PDF)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: https://..."
                          disabled={loading}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Cost and Status in Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shipping.cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Costo del Envío</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="100"
                            placeholder="15000"
                            disabled={loading}
                            {...field}
                            value={field.value || ""}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value) || 0)
                            }
                          />
                        </FormControl>
                        <FormDescription>
                          Cantidad que el cliente pagará por el envío
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shipping.status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado del Envío</FormLabel>
                        <Select
                          disabled={loading}
                          onValueChange={field.onChange}
                          value={field.value}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un estado" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(shippingOptions).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shipping.deliveryDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Días de entrega</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="Ej: 3"
                            disabled={loading}
                            {...field}
                            value={field.value || ""}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value) || 0)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shipping.isCOD"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Pago Contra Entrega</FormLabel>
                          <FormDescription>
                            ¿Este envío es con recaudo?
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="shipping.estimatedDeliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Entrega Estimada</FormLabel>
                      <FormControl>
                        <DatePicker
                          name={field.name}
                          control={form.control}
                          disabled={loading}
                          placeholder="Selecciona una fecha"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shipping.notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas adicionales para el envío</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          placeholder="Ej: Entregar en la portería"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Show carrier logo if available */}
                {carrierInfo && (
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <div
                      className="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-md p-2"
                      style={{
                        backgroundColor: carrierInfo.color || "#FFFFFF",
                      }}
                    >
                      <Image
                        src={carrierInfo.logoUrl}
                        alt={carrierInfo.comercialName}
                        width={64}
                        height={32}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {carrierInfo.comercialName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Transportadora registrada
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
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
