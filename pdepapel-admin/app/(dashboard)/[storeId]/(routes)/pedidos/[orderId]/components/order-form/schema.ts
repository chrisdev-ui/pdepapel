import { ENVIOCLICK_LIMITS } from "@/constants/shipping";
import {
  DiscountType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  ShippingProvider,
  ShippingStatus,
} from "@prisma/client";
import { isValidPhoneNumber } from "react-phone-number-input";
import z from "zod";

import type { GetOrderResult, ProductOption } from "../../server/get-order";

/** Esquema, tipos y valores iniciales del formulario de pedido. */

const optionalDate = z.preprocess((arg) => {
  if (typeof arg === "string" || arg instanceof Date) {
    const date = new Date(arg);
    return isNaN(date.getTime()) ? undefined : date;
  }
  return arg;
}, z.date().optional());

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
    estimatedDeliveryDate: optionalDate,
    notes: z.string().optional(),
    boxId: z.string().optional(),
  })
  .partial();

const discountSchema = z
  .object({
    type: z.nativeEnum(DiscountType),
    amount: z.coerce.number().min(0, "El descuento no puede ser negativo"),
    reason: z.string(),
  })
  .partial();

export const orderItemSchema = z.object({
  productId: z.string().nullable().optional(),
  quantity: z.coerce.number().min(1, "Mínimo 1 unidad"),
  name: z.string().min(1, "Nombre requerido"),
  price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  discountedPrice: z.coerce.number().optional(),
  sku: z.string().optional(),
  imageUrl: z.string().optional(),
  isCustom: z.boolean().default(false),
  stock: z.number().optional(),
  productGroup: z.object({ name: z.string() }).nullable().optional(),
  id: z.string().optional(),
});

const limited = (max: number, label: string) =>
  z.string().max(max, `${label} no puede exceder ${max} caracteres`).optional();

export const orderFormSchema = z
  .object({
    userId: z.string().default(""),
    guestId: z.string().default(""),
    fullName: z
      .string()
      .min(1, "Escribe el nombre del cliente")
      .max(50, "El nombre completo no puede exceder 50 caracteres"),
    email: limited(ENVIOCLICK_LIMITS.email.max, "El correo"),
    phone: z.string().optional(),
    address: limited(ENVIOCLICK_LIMITS.address.max, "La dirección"),
    city: z.string().optional(),
    department: z.string().optional(),
    daneCode: z.string().optional(),
    neighborhood: limited(ENVIOCLICK_LIMITS.suburb.max, "El barrio"),
    addressReference: limited(ENVIOCLICK_LIMITS.reference.max, "La referencia"),
    address2: limited(ENVIOCLICK_LIMITS.crossStreet.max, "La intersección"),
    company: limited(ENVIOCLICK_LIMITS.company.max, "La empresa"),
    adminNotes: z.string().optional(),
    internalNotes: z.string().optional(),
    orderItems: z.array(orderItemSchema).nonempty({ message: "Agrega al menos un producto" }),
    type: z.nativeEnum(OrderType).default(OrderType.STANDARD),
    status: z.nativeEnum(OrderStatus),
    payment: paymentSchema,
    shipping: shippingSchema,
    shippingProvider: z.nativeEnum(ShippingProvider).default(ShippingProvider.NONE),
    envioClickIdRate: z.number().optional(),
    documentId: z.string().default(""),
    subtotal: z.coerce.number().default(0),
    total: z.coerce.number().default(0),
    discount: discountSchema,
    couponCode: z.string().optional(),
    expiresAt: optionalDate,
  })
  .superRefine((data, ctx) => {
    if (data.shippingProvider === ShippingProvider.ENVIOCLICK && (!data.city || !data.department || !data.daneCode)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Elige la ciudad con el buscador para cotizar con EnvioClick", path: ["daneCode"] });
    }
    if (data.discount?.type === DiscountType.PERCENTAGE && (data.discount.amount ?? 0) > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un descuento porcentual no puede superar el 100 %", path: ["discount", "amount"] });
    }
    if (data.discount?.type && !data.discount.amount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escribe el monto del descuento", path: ["discount", "amount"] });
    }
    if (isRealOrderStatus(data.status)) {
      if (!data.email || !z.string().email().safeParse(data.email).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un pedido activo necesita un correo válido", path: ["email"] });
      }
      if (!data.phone || !isValidPhoneNumber(data.phone)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un pedido activo necesita un teléfono válido", path: ["phone"] });
      }
      if (!data.address || data.address.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un pedido activo necesita la dirección", path: ["address"] });
      }
      if (data.orderItems.some((item) => !item.productId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un pedido activo no puede tener ítems manuales: conviértelos en productos o déjalo como borrador", path: ["orderItems"] });
      }
    }
  });

export type OrderFormValues = z.infer<typeof orderFormSchema>;
export type OrderItemValue = z.infer<typeof orderItemSchema>;

export const REAL_ORDER_STATUSES: OrderStatus[] = [OrderStatus.CREATED, OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.SENT];
export function isRealOrderStatus(status: OrderStatus): boolean {
  return REAL_ORDER_STATUSES.includes(status);
}

export interface ShippingQuote {
  idRate: number;
  carrier: string;
  product: string;
  flete: number;
  minimumInsurance: number;
  totalCost: number;
  deliveryDays: string | number;
  isCOD: boolean;
}

export const safeDate = (date: string | Date | null | undefined): Date | undefined => {
  if (!date) return undefined;
  const parsed = new Date(date);
  return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed : undefined;
};

export const parseOrderDetails = (details: unknown): Record<string, unknown> => {
  if (!details) return {};
  if (typeof details === "string") {
    try {
      return JSON.parse(details);
    } catch {
      return {};
    }
  }
  return details as Record<string, unknown>;
};

export const generateGuestId = () => "guest_" + Math.random().toString(36).slice(2, 11);

/** Deshace la conversión porcentaje → monto que guarda la base de datos. */
export const getOriginalDiscountAmount = (order: NonNullable<GetOrderResult["order"]>) => {
  if (!order.discount || !order.discountType) return undefined;
  if (order.discountType === DiscountType.PERCENTAGE) {
    if (!order.subtotal) return undefined;
    return Math.round((order.discount / order.subtotal) * 100 * 100) / 100;
  }
  return order.discount;
};

/** Tipos que se crean desde esta pantalla; feria y punto de venta tienen su propio módulo. */
/** Tipos que se crean desde el formulario. `QUOTATION` se retiró en 2026-09: se muestra, no se crea. */
export type CreatableOrderType = typeof OrderType.STANDARD | typeof OrderType.CUSTOM;

export interface OrderTypePreset {
  type: CreatableOrderType;
  label: string;
  description: string;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  /** Días de validez por defecto (solo cotizaciones). */
  validDays?: number;
  allowManualItems: boolean;
  showPayment: boolean;
  notesLabel: string;
  notesHint: string;
}

export const ORDER_TYPE_PRESETS: Record<CreatableOrderType, OrderTypePreset> = {
  [OrderType.STANDARD]: {
    type: OrderType.STANDARD,
    label: "Pedido de tienda",
    description: "Una venta por WhatsApp o redes con productos del catálogo. Nace pendiente de pago.",
    status: OrderStatus.PENDING,
    paymentMethod: PaymentMethod.BankTransfer,
    allowManualItems: false,
    showPayment: true,
    notesLabel: "Notas para el cliente",
    notesHint: "Se muestran en la página del pedido.",
  },
  [OrderType.CUSTOM]: {
    type: OrderType.CUSTOM,
    label: "Pedido personalizado",
    description: "Algo hecho a la medida. Empieza como borrador con ítems manuales y se activa cuando el precio está listo.",
    status: OrderStatus.DRAFT,
    paymentMethod: PaymentMethod.BankTransfer,
    allowManualItems: true,
    showPayment: true,
    notesLabel: "Descripción del trabajo",
    notesHint: "Qué se va a hacer y con qué acuerdos; el cliente la ve.",
  },
};

export function isCreatableOrderType(value: unknown): value is CreatableOrderType {
  return value === OrderType.STANDARD || value === OrderType.CUSTOM;
}

const EMPTY_SHIPPING: OrderFormValues["shipping"] = {
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
  boxId: undefined,
};

export function buildNewOrderDefaults(preset: OrderTypePreset, guestId: string): OrderFormValues {
  const expiresAt = preset.validDays ? new Date(Date.now() + preset.validDays * 24 * 60 * 60 * 1000) : undefined;
  return {
    userId: "",
    guestId,
    fullName: "",
    orderItems: [] as unknown as OrderFormValues["orderItems"],
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
    status: preset.status,
    type: preset.type,
    payment: preset.paymentMethod ? { method: preset.paymentMethod } : {},
    adminNotes: "",
    internalNotes: "",
    shippingProvider: ShippingProvider.NONE,
    envioClickIdRate: undefined,
    shipping: { ...EMPTY_SHIPPING },
    subtotal: 0,
    total: 0,
    discount: {},
    couponCode: "",
    expiresAt,
  };
}

export function buildExistingOrderDefaults(order: NonNullable<GetOrderResult["order"]>, products: ProductOption[]): OrderFormValues {
  const raw = order as typeof order & { adminNotes?: string | null; internalNotes?: string | null };
  return {
    ...order,
    userId: order.userId || "",
    guestId: order.guestId || "",
    documentId: order.documentId || "",
    email: order.email || "",
    phone: order.phone || "",
    address: order.address || "",
    city: order.city || "",
    department: order.department || "",
    daneCode: order.daneCode || "",
    neighborhood: order.neighborhood || "",
    addressReference: order.addressReference || "",
    address2: order.address2 || "",
    company: order.company || "",
    subtotal: order.subtotal || 0,
    total: order.total || 0,
    discount: {
      type: order.discountType || undefined,
      amount: getOriginalDiscountAmount(order),
      reason: order.discountReason || undefined,
    },
    adminNotes: raw.adminNotes || "",
    internalNotes: raw.internalNotes || "",
    couponCode: order.coupon?.code || "",
    orderItems: order.orderItems.map((item) => {
      const product = products.find((p) => p.value === item.productId);
      return {
        id: item.id || undefined,
        productId: item.productId || null,
        quantity: item.quantity,
        name: item.name || product?.name || "Producto sin nombre",
        price: item.price || product?.price || 0,
        sku: item.sku || product?.sku || "",
        imageUrl: item.imageUrl || product?.image || "",
        isCustom: item.isCustom || false,
        stock: product?.stock || 0,
      };
    }) as unknown as OrderFormValues["orderItems"],
    payment: {
      method: order.payment?.method ?? undefined,
      transactionId: order.payment?.transactionId || undefined,
    },
    shippingProvider: order.shipping?.provider || ShippingProvider.NONE,
    envioClickIdRate: order.shipping?.envioClickIdRate || undefined,
    shipping: {
      status: order.shipping?.status || ShippingStatus.Preparing,
      courier: order.shipping?.courier || undefined,
      carrierName: order.shipping?.carrierName || undefined,
      productName: order.shipping?.productName || undefined,
      flete: order.shipping?.flete || undefined,
      minimumInsurance: order.shipping?.minimumInsurance || undefined,
      deliveryDays: order.shipping?.deliveryDays || undefined,
      isCOD: order.shipping?.isCOD || false,
      cost: order.shipping?.cost || 0,
      trackingCode: order.shipping?.trackingCode || undefined,
      trackingUrl: order.shipping?.trackingUrl || undefined,
      guideUrl: order.shipping?.guideUrl || undefined,
      estimatedDeliveryDate: safeDate(order.shipping?.estimatedDeliveryDate),
      notes: order.shipping?.notes || undefined,
      boxId: order.shipping?.boxId || undefined,
    },
    expiresAt: safeDate(order.expiresAt),
  };
}
