"use client";

import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  OrderStatus,
  OrderType,
  ShippingProvider,
  ShippingStatus,
  type Box,
  type Category,
  type Coupon,
} from "@prisma/client";
import axios, { isAxiosError } from "axios";
import { RefreshCw, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import { AlertModal } from "@/components/modals/alert-modal";
import { ProductConversionModal } from "@/components/modals/product-conversion-modal";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import type { LocationOption } from "@/components/ui/location-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api-errors";
import type { OpenInventoryIssue } from "@/lib/order-inventory-issues";
import { InventoryIssuesPanel } from "@/components/inventory/inventory-issues-panel";
import { focusFirstInvalidField } from "@/lib/focus-invalid-field";
import { getFirstFormErrorMessage } from "@/lib/form-errors";
import { isPaidLike, ORDER_STATUS_LABELS } from "@/lib/order-transitions";
import { currencyFormatter } from "@/lib/utils";
import dynamic from "next/dynamic";

import type { NextStepCard, TimelineStep } from "@/lib/order-timeline";
import type { GetOrderResult, ProductOption } from "../server/get-order";
import { CustomerCard, type CustomerOption } from "./order-form/customer-card";
import { DiscountsSection } from "./order-form/discounts-section";
import { HistoryCard } from "./order-form/history-card";
import { ItemsSection } from "./order-form/items-section";
import { LeaveGuard } from "./order-form/leave-guard";
import { NotesCard } from "./order-form/notes-card";
import { OrderTypePicker } from "./order-form/order-type-picker";
import { PaymentCard } from "./order-form/payment-card";
import {
  buildExistingOrderDefaults,
  buildNewOrderDefaults,
  generateGuestId,
  isCreatableOrderType,
  isRealOrderStatus,
  ORDER_TYPE_PRESETS,
  orderFormSchema,
  type CreatableOrderType,
  type OrderFormValues,
  type ShippingQuote,
} from "./order-form/schema";
import { SectionCard } from "./order-form/section-card";
import { OrderStatusBar } from "./order-form/status-bar";
import { ShippingSection } from "./order-form/shipping-section";
import { type TransitionPayload } from "./order-form/status-actions";
import { SummaryCard } from "./order-form/summary-card";
import { useOrderTotals } from "./order-form/use-order-totals";

const InvoiceDownloadButton = dynamic(
  () =>
    import("@/components/invoice/invoice-download-button").then(
      (mod) => mod.InvoiceDownloadButton,
    ),
  {
    ssr: false,
    loading: () => (
      <Button type="button" variant="outline" size="sm" disabled>
        Preparando PDF…
      </Button>
    ),
  },
);

interface OrderFormProps {
  storeId: string;
  initialData: GetOrderResult["order"];
  products: ProductOption[];
  availableCoupons: Coupon[];
  users: CustomerOption[];
  categories: Category[];
  locations: LocationOption[];
  boxes: Box[];
  freeShippingThreshold?: number | null;
  /** Estado real del envío (guía, seguimiento), renderizado en el servidor. */
  shippingInfo?: React.ReactNode;
  /** Líneas de inventario que fallaron al mover y siguen abiertas. */
  inventoryIssues?: OpenInventoryIssue[];
  /** Qué toca ahora, calculado en el servidor con `getNextStepCard`. */
  nextStep?: NextStepCard | null;
  /** Línea de tiempo del pedido, calculada en el servidor. */
  timeline?: TimelineStep[];
}

const TYPE_PARAM: Record<string, CreatableOrderType> = {
  tienda: OrderType.STANDARD,
  personalizado: OrderType.CUSTOM,
};

interface SubmitOptions {
  status?: OrderStatus;
  transactionId?: string;
  trackingCode?: string;
  skipAutoGuide?: boolean;
}

/**
 * Orquestador del pedido: estado del formulario, envío a la API y disposición
 * en dos columnas. Cada bloque vive en `./order-form/*`; los cambios de estado
 * son acciones explícitas (`StatusActions`), nunca un selector suelto.
 */
export const OrderForm: React.FC<OrderFormProps> = ({
  storeId,
  initialData,
  products,
  categories,
  availableCoupons,
  users,
  locations,
  boxes,
  freeShippingThreshold = null,
  shippingInfo,
  inventoryIssues = [],
  nextStep = null,
  timeline = [],
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const requestedType = TYPE_PARAM[searchParams.get("tipo") ?? ""] ?? null;
  const [chosenType, setChosenType] = useState<CreatableOrderType | null>(
    initialData ? null : requestedType,
  );
  const [guestId] = useState(() => generateGuestId());
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const currentType = initialData?.type ?? chosenType ?? OrderType.STANDARD;
  const preset =
    ORDER_TYPE_PRESETS[
      isCreatableOrderType(currentType) ? currentType : OrderType.STANDARD
    ];

  const defaultValues = useMemo(
    () =>
      initialData
        ? buildExistingOrderDefaults(initialData, products)
        : buildNewOrderDefaults(preset, guestId),
    [initialData, products, preset, guestId],
  );

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues,
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const [coupon, setCoupon] = useState<Coupon | null>(
    initialData?.coupon ?? null,
  );
  const serverVersion = `${initialData?.id ?? "new"}:${initialData?.updatedAt ? new Date(initialData.updatedAt).getTime() : ""}:${chosenType ?? ""}`;
  const lastVersion = useRef(serverVersion);
  useEffect(() => {
    if (lastVersion.current === serverVersion) return;
    lastVersion.current = serverVersion;
    form.reset(defaultValues);
    setCoupon(initialData?.coupon ?? null);
  }, [serverVersion, defaultValues, form, initialData]);

  const fieldArray = useFieldArray({
    control: form.control,
    name: "orderItems",
  });
  const watchedItems = useWatch({ control: form.control, name: "orderItems" });
  const watchedType = useWatch({ control: form.control, name: "type" });
  const watchedProvider = useWatch({
    control: form.control,
    name: "shippingProvider",
  });
  const watchedRateId = useWatch({
    control: form.control,
    name: "envioClickIdRate",
  });
  const watchedCarrier = useWatch({
    control: form.control,
    name: "shipping.carrierName",
  });
  const watchedShippingCost = useWatch({
    control: form.control,
    name: "shipping.cost",
  });
  const watchedTracking = useWatch({
    control: form.control,
    name: "shipping.trackingCode",
  });
  const watchedTransaction = useWatch({
    control: form.control,
    name: "payment.transactionId",
  });
  const { isDirty } = form.formState;

  const [loading, setLoading] = useState(false);
  // `/pedidos/nuevo` y `/pedidos/<id>` son el mismo segmento dinamico: Next
  // no muestra `loading.tsx` al cambiar solo el parametro, deja en pantalla el
  // formulario recien llenado mientras trae la ficha (1,2 MB de payload) y
  // `finally` ya lo habia vuelto a habilitar. Con el toast de "creado" ya
  // visible, eso se lee como "se quedo pegado". La transicion mantiene el
  // boton ocupado hasta que la ficha de verdad aparece.
  const [isNavigating, startNavigation] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [conversionIndex, setConversionIndex] = useState<number | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [recommendedBox, setRecommendedBox] = useState<{
    name: string;
    width: number;
    height: number;
    length: number;
  } | null>(null);
  const [quotedAt, setQuotedAt] = useState<Date | null>(null);

  const { clearStorage } = useFormPersist({
    form,
    // Existing orders never persist nor restore drafts: the server is authoritative.
    key: `order-form-${storeId}-${initialData ? initialData.id : `${currentType}-new`}`,
    enabled: !initialData,
  });
  useFormValidationToast({ form });

  const { totals, shippingChargeState, shippingCost } = useOrderTotals(
    form.control,
    coupon,
    freeShippingThreshold,
  );
  const locked = Boolean(initialData && isPaidLike(initialData.status));
  const currentStatus = initialData?.status ?? preset.status;
  const editPreset =
    ORDER_TYPE_PRESETS[
      isCreatableOrderType(watchedType) ? watchedType : OrderType.STANDARD
    ];
  const allowManualItems =
    editPreset.allowManualItems && !isRealOrderStatus(currentStatus) && !locked;

  const CHANGED_LABELS: Record<string, string> = {
    fullName: "el cliente",
    phone: "el cliente",
    email: "el cliente",
    documentId: "el cliente",
    city: "la ciudad",
    department: "la ciudad",
    daneCode: "la ciudad",
    address: "la dirección",
    orderItems: "los productos",
    shipping: "el envío",
    shippingProvider: "el envío",
    envioClickIdRate: "la tarifa",
    payment: "el pago",
    discount: "el descuento",
    couponCode: "el cupón",
    notes: "las notas",
    internalNotes: "las notas",
    type: "el tipo",
  };
  const changed = Array.from(
    new Set(
      Object.keys(form.formState.dirtyFields)
        .map((key) => CHANGED_LABELS[key])
        .filter((label): label is string => Boolean(label)),
    ),
  );

  const submitOrder = useCallback(
    async (data: OrderFormValues, options: SubmitOptions = {}) => {
      let finalUserId = data.userId;
      let finalGuestId = data.guestId;
      if (finalUserId?.startsWith("guest_")) {
        finalGuestId = finalUserId;
        finalUserId = "";
      } else if (finalUserId?.startsWith("clerk_")) {
        finalUserId = finalUserId.replace("clerk_", "");
      }
      const status = options.status ?? (initialData ? undefined : data.status);
      const payload = {
        ...data,
        status,
        expectedStatus: initialData?.status,
        userId: finalUserId,
        guestId: finalGuestId,
        payment: {
          ...data.payment,
          ...(options.transactionId
            ? { transactionId: options.transactionId }
            : {}),
        },
        shipping: {
          ...data.shipping,
          ...(options.trackingCode
            ? { trackingCode: options.trackingCode }
            : {}),
        },
        subtotal: totals.subtotal,
        total: totals.total,
        discountType: data.discount?.type,
        discountAmount: data.discount?.amount,
        discountReason: data.discount?.reason,
        // Crear una guía cobra dinero: solo se crea desde la confirmación de
        // pago o desde el botón «Crear guía ahora», nunca al guardar datos.
        skipAutoGuide: options.skipAutoGuide ?? true,
      };

      setLoading(true);
      setConflict(null);
      try {
        if (initialData) {
          const response = await axios.patch(
            `/api/${storeId}/orders/${initialData.id}`,
            payload,
          );
          clearStorage();
          const guide = response.data?.guideCreation;
          if (guide?.attempted && !guide.success) {
            toast({
              title: "Pedido guardado, pero la guía falló",
              description: guide.error || "Créala desde la sección Envío.",
              variant: "warning",
            });
          } else if (guide?.attempted && guide.success) {
            toast({ title: "Pedido pagado y guía creada", variant: "success" });
          } else if (options.status) {
            toast({
              title: `Ahora está «${ORDER_STATUS_LABELS[options.status]}»`,
              variant: "success",
            });
          } else {
            toast({ description: "Cambios guardados", variant: "success" });
          }
          router.refresh();
        } else {
          const response = await axios.post(`/api/${storeId}/orders`, payload, {
            headers: { "Idempotency-Key": idempotencyKey },
          });
          clearStorage();
          setIdempotencyKey(crypto.randomUUID());
          toast({
            title: "Pedido creado",
            description: `${response.data.orderNumber} · ${currencyFormatter(Number(response.data.total))}. Abriendo el pedido…`,
            variant: "success",
          });
          startNavigation(() => {
            router.push(`/${storeId}/pedidos/${response.data.id}`);
          });
          return;
        }
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 409) {
          setConflict(
            getErrorMessage(error) || "El pedido cambió mientras lo editabas.",
          );
        } else {
          toast({
            title: "No se pudo guardar",
            description: getErrorMessage(error),
            variant: "destructive",
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [
      clearStorage,
      idempotencyKey,
      initialData,
      router,
      storeId,
      toast,
      totals.subtotal,
      totals.total,
    ],
  );

  const onSubmit = (data: OrderFormValues) => submitOrder(data);

  const onTransition = useCallback(
    async ({
      to,
      transactionId,
      trackingCode,
      createGuide,
    }: TransitionPayload) => {
      form.setValue("status", to, { shouldDirty: true });
      if (transactionId)
        form.setValue("payment.transactionId", transactionId, {
          shouldDirty: true,
        });
      if (trackingCode)
        form.setValue("shipping.trackingCode", trackingCode, {
          shouldDirty: true,
        });
      const valid = await form.trigger();
      if (!valid) {
        form.setValue("status", initialData?.status ?? preset.status);
        const first = getFirstFormErrorMessage(form.formState.errors);
        console.error(
          "[order-form] transición bloqueada por validación",
          form.formState.errors,
        );
        toast({
          title: "Revisa el formulario antes de cambiar el estado",
          description: first ?? "Hay campos con errores.",
          variant: "destructive",
        });
        return;
      }
      const data = form.getValues();
      // La decisión de la guía viene del propio diálogo de «Marcar como
      // pagado»; cuando no aplica (sin tarifa, ya hay guía) queda en su
      // valor por defecto: no crear.
      const options: SubmitOptions = {
        status: to,
        transactionId,
        trackingCode,
        skipAutoGuide: createGuide === undefined ? undefined : !createGuide,
      };
      await submitOrder(data, options);
    },
    [form, initialData, preset.status, submitOrder, toast],
  );

  // El toast lo pone `useFormValidationToast`; aquí solo se lleva la vista
  // al campo, que en un formulario tan largo casi siempre está fuera de
  // pantalla.
  const onInvalid = useCallback(() => focusFirstInvalidField(), []);

  const onDelete = async () => {
    if (!initialData) return;
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/orders/${initialData.id}`);
      clearStorage();
      toast({ description: "Pedido eliminado", variant: "success" });
      router.push(`/${storeId}/pedidos`);
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  const onGetShippingQuotes = useCallback(
    async (
      options: { silent?: boolean } = {},
    ): Promise<ShippingQuote[] | null> => {
      const data = form.getValues();
      if (!data.city || !data.department || !data.daneCode) {
        if (!options.silent) {
          toast({
            title: "Falta la ciudad",
            description:
              "Elige la ciudad del cliente con el buscador para cotizar.",
            variant: "destructive",
          });
        }
        return null;
      }
      if (data.orderItems.length === 0) {
        if (!options.silent) {
          toast({
            title: "Sin productos",
            description: "Agrega al menos un producto para cotizar el envío.",
            variant: "destructive",
          });
        }
        return null;
      }
      try {
        setLoadingQuotes(true);
        const response = await axios.post(`/api/${storeId}/shipment/quote`, {
          destination: {
            daneCode: data.daneCode || "",
            address: data.address || "",
          },
          orderTotal: totals.total,
          items: data.orderItems.map((item) => ({ ...item })),
          boxId: data.shipping.boxId,
          forceRefresh: !options.silent,
          isCOD: data.shipping?.isCOD || false,
        });
        const quotes: ShippingQuote[] = response.data.quotes ?? [];
        setShippingQuotes(quotes);
        setRecommendedBox(response.data.packageDimensions ?? null);
        setQuotedAt(new Date());
        // La tarifa que estaba elegida ya no existe en esta cotización
        // (cambió el destino, el contenido o la forma de pago): se suelta
        // para que no llegue a la guía. La sección vuelve a elegir una.
        const currentRate = form.getValues("envioClickIdRate");
        if (currentRate && !quotes.some((q) => q.idRate === currentRate)) {
          form.setValue("envioClickIdRate", undefined, { shouldDirty: true });
          form.setValue("shipping.cost", 0, { shouldDirty: true });
          form.setValue("shipping.carrierName", "", { shouldDirty: true });
          form.setValue("shipping.courier", "", { shouldDirty: true });
        }
        if (quotes.length === 0) {
          toast({
            title: "Sin tarifas",
            description:
              "Ninguna transportadora cubre esta ciudad con EnvioClick. Prueba «Otra transportadora».",
            variant: options.silent ? "warning" : "destructive",
          });
        }
        return quotes;
      } catch (error) {
        toast({
          title: "No se pudo cotizar",
          description: getErrorMessage(error),
          variant: "destructive",
        });
        return null;
      } finally {
        setLoadingQuotes(false);
      }
    },
    [form, storeId, toast, totals.total],
  );

  const onSelectRate = useCallback(
    (quote: ShippingQuote, options: { silent?: boolean } = {}) => {
      form.setValue("shippingProvider", ShippingProvider.ENVIOCLICK, {
        shouldDirty: true,
      });
      form.setValue("envioClickIdRate", quote.idRate, { shouldDirty: true });
      form.setValue(
        "shipping",
        {
          ...form.getValues("shipping"),
          carrierName: quote.carrier,
          courier: quote.carrier,
          productName: quote.product,
          flete: quote.flete,
          minimumInsurance: quote.minimumInsurance,
          deliveryDays:
            typeof quote.deliveryDays === "string"
              ? parseInt(quote.deliveryDays)
              : quote.deliveryDays,
          // `isCOD` es la decisión de la administradora (paga contra
          // entrega), no la capacidad de la transportadora: la tarifa no la
          // sobreescribe. Si la transportadora no recauda, la sección avisa.
          isCOD: form.getValues("shipping.isCOD") ?? false,
          cost: quote.totalCost,
          status: ShippingStatus.Preparing,
        },
        { shouldDirty: true },
      );
      if (!options.silent) {
        toast({
          description: `${quote.carrier} · ${currencyFormatter(quote.totalCost)}`,
          variant: "success",
        });
      }
    },
    [form, toast],
  );

  /**
   * Un solo «Descartar tarifa»: limpia el formulario y, si la cotización ya
   * estaba guardada en el pedido, también la quita del servidor (que además
   * resta el flete del total).
   */
  const onDiscardRate = useCallback(async () => {
    if (initialData?.shipping?.envioClickIdRate) {
      try {
        await axios.delete(
          `/api/${storeId}/orders/${initialData.id}/shipping/clear-rate`,
        );
        toast({ description: "Tarifa descartada", variant: "success" });
        router.refresh();
      } catch (error) {
        toast({ description: getErrorMessage(error), variant: "destructive" });
        return;
      }
    }
    setShippingQuotes([]);
    setQuotedAt(null);
    setRecommendedBox(null);
    form.setValue("envioClickIdRate", undefined, { shouldDirty: true });
    form.setValue("shipping.cost", 0, { shouldDirty: true });
    form.setValue("shipping.carrierName", "", { shouldDirty: true });
    form.setValue("shipping.courier", "", { shouldDirty: true });
  }, [form, initialData, router, storeId, toast]);

  /** Tarifa lista para la guía: alimenta la decisión del diálogo de pago. */
  const guideRate =
    watchedProvider === ShippingProvider.ENVIOCLICK &&
    watchedRateId &&
    !initialData?.shipping?.envioClickIdOrder
      ? {
          carrier: watchedCarrier || "transportadora",
          cost: Number(watchedShippingCost ?? 0),
        }
      : null;

  const invoiceData = useMemo(() => {
    if (!initialData) return null;
    const values = form.getValues();
    return {
      orderNumber: initialData.orderNumber || "",
      createdAt: initialData.createdAt,
      customerName: values.fullName || "Cliente",
      customerEmail: values.email || "",
      customerPhone: values.phone || "",
      documentId: values.documentId || "",
      address: values.address || "",
      city: values.city || "",
      department: values.department || "",
      items: (watchedItems || []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: Number(item.price),
        sku: item.sku,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount + totals.couponDiscount,
      shipping: shippingCost,
      total: totals.total,
      paymentMethod: values.payment?.method || "N/A",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, watchedItems, totals, shippingCost]);

  if (!initialData && !chosenType) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            Nuevo pedido
          </h1>
          <p className="text-sm text-muted-foreground">
            Elige qué vas a registrar: cada tipo muestra solo lo que necesita.
          </p>
        </div>
        <OrderTypePicker
          storeId={storeId}
          onPick={(type) => setChosenType(type)}
        />
      </div>
    );
  }

  return (
    <>
      <AlertModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <ProductConversionModal
        isOpen={conversionIndex !== null}
        onClose={() => setConversionIndex(null)}
        loading={loading}
        categories={categories}
        initialData={
          conversionIndex !== null
            ? {
                name: form.getValues(`orderItems.${conversionIndex}.name`),
                price: form.getValues(`orderItems.${conversionIndex}.price`),
                quantity: form.getValues(
                  `orderItems.${conversionIndex}.quantity`,
                ),
                orderId: initialData?.id,
                orderItemId: form.getValues(`orderItems.${conversionIndex}.id`),
              }
            : null
        }
        onConfirm={(product: any) => {
          if (conversionIndex === null) return;
          const currentItem = form.getValues(`orderItems.${conversionIndex}`);
          fieldArray.update(conversionIndex, {
            ...currentItem,
            productId: product.id,
            name: product.name,
            price: product.price,
            sku: product.sku || undefined,
            imageUrl: product.images?.[0]?.url,
            stock: product.stock,
            isCustom: false,
            productGroup: product.category
              ? { name: product.category.name }
              : undefined,
          });
          setConversionIndex(null);
        }}
      />

      {!initialData && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">
              Nuevo pedido · {preset.label}
            </h1>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto p-0"
              onClick={() => setChosenType(null)}
            >
              Cambiar tipo
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{preset.description}</p>
        </div>
      )}

      {conflict && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-tint-pink bg-tint-pink/60 p-4 text-sm text-primary sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="font-semibold">{conflict}</span>
          <Button type="button" size="sm" onClick={() => router.refresh()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Recargar el pedido
          </Button>
        </div>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          className="flex flex-col gap-4 pb-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:pb-6 xl:grid-cols-[minmax(0,1fr)_400px]"
          autoComplete="off"
        >
          {initialData?.orderNumber && (
            <h2 className="sr-only">Pedido {initialData.orderNumber}</h2>
          )}
          <LeaveGuard
            when={isDirty && !loading && !isNavigating}
            changed={changed}
          />
          {/* Columna principal, en el orden en que Paula llena un pedido:
              cliente, productos, envío, descuentos, notas. */}
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            {initialData && (
              <div className="order-1 lg:order-none">
                <OrderStatusBar
                  status={initialData.status}
                  type={watchedType}
                  paymentMethod={initialData.payment?.method ?? null}
                  shippingProvider={watchedProvider}
                  trackingCode={watchedTracking}
                  transactionId={watchedTransaction}
                  guideRate={guideRate}
                  hasGuide={Boolean(initialData.shipping?.envioClickIdOrder)}
                  nextStep={nextStep}
                  steps={timeline}
                  loading={loading}
                  onTransition={onTransition}
                />
              </div>
            )}
            {initialData &&
              isCreatableOrderType(initialData.type) &&
              !locked && (
                <div className="order-2 flex flex-col gap-2 rounded-xl border bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between lg:order-none">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-3 space-y-0">
                        <FormLabel className="whitespace-nowrap">
                          Tipo de pedido
                        </FormLabel>
                        <Select
                          disabled={loading}
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9 w-[220px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.values(ORDER_TYPE_PRESETS).map((option) => (
                              <SelectItem key={option.type} value={option.type}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            <div className="order-3 lg:order-none">
              <CustomerCard
                storeId={storeId}
                users={users}
                locations={locations}
                loading={loading}
                initialData={initialData}
                total={totals.total}
              />
            </div>
            <div className="order-4 lg:order-none">
              <ItemsSection
                fieldArray={fieldArray}
                watchedItems={watchedItems}
                locked={locked}
                allowManualItems={allowManualItems}
                loading={loading}
                onConvert={setConversionIndex}
              />
            </div>
            <div className="order-5 lg:order-none">
              <ShippingSection
                storeId={storeId}
                boxes={boxes}
                initialData={initialData}
                loading={loading}
                loadingQuotes={loadingQuotes}
                shippingQuotes={shippingQuotes}
                quotedAt={quotedAt}
                recommendedBox={recommendedBox}
                onGetShippingQuotes={onGetShippingQuotes}
                onSelectRate={onSelectRate}
                onDiscardRate={onDiscardRate}
              >
                {shippingInfo}
              </ShippingSection>
            </div>
            <div className="order-8 lg:order-none">
              <DiscountsSection
                storeId={storeId}
                availableCoupons={availableCoupons}
                coupon={coupon}
                setCoupon={setCoupon}
                initialCoupon={initialData?.coupon ?? null}
                subtotal={totals.subtotal}
                locked={locked}
                loading={loading}
              />
            </div>
            <div className="order-9 lg:order-none">
              <NotesCard preset={editPreset} />
            </div>
            {initialData && (
              <div className="order-11 lg:order-none">
                <SectionCard
                  id="zona-de-cuidado"
                  title="Zona de cuidado"
                  tone="care"
                  description="Solo lo que no se puede deshacer. Cancelar y cambiar de estado viven arriba, en la barra del pedido."
                >
                  <InventoryIssuesPanel
                    storeId={storeId}
                    issues={inventoryIssues}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      {initialData?.shipping?.envioClickIdOrder
                        ? "Este pedido tiene una guía de EnvioClick activa: cancela el envío antes de eliminarlo, o la guía seguirá cobrada y sin registro."
                        : "Eliminar borra el pedido de forma definitiva; si ya estaba pagado o enviado, el inventario vuelve con un movimiento."}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => setDeleteOpen(true)}
                      className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash className="h-4 w-4" aria-hidden="true" />
                      Eliminar pedido
                    </Button>
                  </div>
                </SectionCard>
              </div>
            )}
          </div>
          {/* Columna lateral: consulta (resumen, pago, historial). Cliente y
              Notas viven en la principal: son largos y dejaban la lateral sin
              poder fijarse. */}
          <aside className="contents lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4">
            {/* En tableta Pago y Resumen comparten fila, justo después del envío. */}
            <div className="order-6 grid gap-4 md:grid-cols-2 lg:contents">
  <SummaryCard
                totals={totals}
                shippingChargeState={shippingChargeState}
                shippingCost={shippingCost}
                coupon={coupon}
                itemCount={(watchedItems ?? []).reduce(
                  (sum, item) => sum + Number(item.quantity || 0),
                  0,
                )}
              />
            {(editPreset.showPayment || initialData) && (
                <PaymentCard
                className="order-first md:order-none"
                  storeId={storeId}
                  initialData={initialData}
                  type={watchedType}
                  loading={loading}
                  isDirty={isDirty}
                  showMethod={
                    editPreset.showPayment || Boolean(initialData?.payment)
                  }
                  onTransition={onTransition}
                />
              )}
              
            </div>
            {initialData && (
              <div className="order-10 lg:order-none">
                <HistoryCard
                  order={initialData}
                  action={
                    invoiceData ? (
                      <InvoiceDownloadButton
                        data={invoiceData}
                        disabled={loading}
                      />
                    ) : undefined
                  }
                />
              </div>
            )}
          </aside>
          <div className="sticky bottom-[84px] z-20 order-12 flex flex-col gap-3 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-4 lg:order-none lg:col-span-2">
            <div className="flex items-center justify-between gap-3 lg:hidden">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-base font-bold text-primary">
                {currencyFormatter(totals.total)}
              </span>
            </div>
            <p className="hidden text-xs text-muted-foreground lg:block">
              {initialData
                ? locked
                  ? "Pagado: se guardan cliente, envío y notas. Productos y precios quedan como registro."
                  : "Guardar solo guarda los datos. El estado cambia con las acciones de la barra de arriba."
                : `Se creará como «${ORDER_STATUS_LABELS[preset.status]}». ${preset.status === OrderStatus.DRAFT ? "Podrás activarlo cuando esté listo." : "Nada se descuenta hasta marcarlo pagado."}`}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              {initialData ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => form.reset(defaultValues)}
                  disabled={loading || !isDirty}
                >
                  Descartar cambios
                </Button>
              ) : (
                <Button asChild variant="outline" disabled={isNavigating}>
                  <Link
                    href={`/${storeId}/pedidos`}
                    aria-disabled={isNavigating}
                    tabIndex={isNavigating ? -1 : undefined}
                    className={
                      isNavigating
                        ? "pointer-events-none opacity-60"
                        : undefined
                    }
                  >
                    Cancelar
                  </Link>
                </Button>
              )}
              <Button
                type="submit"
                disabled={
                  loading || isNavigating || (Boolean(initialData) && !isDirty)
                }
                isLoading={loading || isNavigating}
                loadingText={
                  isNavigating
                    ? "Abriendo el pedido…"
                    : initialData
                      ? "Guardando…"
                      : "Creando…"
                }
                className="sm:min-w-[160px]"
              >
                {initialData ? "Guardar cambios" : "Crear pedido"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </>
  );
};
