import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from "@prisma/client";

export const DEFAULT_COUNTRY = "CO";

export const EMPLOYEE_NAMES = ["Melisa", "Susana", "Paula Morales"];

export const EMPLOYEE_PHONES = ["3136422316", "3505646475", "3142829044"];

export const BATCH_SIZE = 100;
export const MAX_WAIT_TIME = 30000; // 30 seconds
export const TIMEOUT_TIME = 60000; // 60 seconds

export const GENERIC_ERROR =
  "Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo más tarde.";

export type SortOption =
  | "default"
  | "dateAdded"
  | "priceLowToHigh"
  | "priceHighToLow"
  | "name"
  | "featuredFirst";

export type PriceRanges =
  | "[0,5000]"
  | "[5000,10000]"
  | "[10000,20000]"
  | "[20000,50000]"
  | "[50000,99999999]";

export const SORT_OPTIONS: Record<
  SortOption,
  Record<string, "asc" | "desc">
> = {
  default: { createdAt: "desc" },
  dateAdded: { createdAt: "desc" },
  priceLowToHigh: { price: "asc" },
  priceHighToLow: { price: "desc" },
  name: { name: "asc" },
  featuredFirst: { isFeatured: "desc" },
};
export const PRICE_RANGES = {
  "[0,5000]": { gte: 0, lte: 5000 },
  "[5000,10000]": { gte: 5000, lte: 10000 },
  "[10000,20000]": { gte: 10000, lte: 20000 },
  "[20000,50000]": { gte: 20000, lte: 50000 },
  "[50000,99999999]": { gte: 50000 },
};

export const START_YEAR = 2023;

export const statusOptions = {
  [OrderStatus.CREATED]: "Creada",
  [OrderStatus.PENDING]: "Pendiente",
  [OrderStatus.PAID]: "Pagada",
  [OrderStatus.CANCELLED]: "Cancelada",
};

export const paymentOptions = {
  [PaymentMethod.BankTransfer]: "Transferencia bancaria",
  [PaymentMethod.COD]: "Contra entrega",
  [PaymentMethod.PayU]: "PayU",
  [PaymentMethod.Wompi]: "Wompi",
};

export const discountOptions = {
  [DiscountType.PERCENTAGE]: "Porcentaje",
  [DiscountType.FIXED]: "Monto fijo",
};

export const shippingOptions = {
  [ShippingStatus.Preparing]: "En preparación",
  [ShippingStatus.Shipped]: "Enviado",
  [ShippingStatus.PickedUp]: "Recogido",
  [ShippingStatus.InTransit]: "En tránsito",
  [ShippingStatus.OutForDelivery]: "En reparto",
  [ShippingStatus.Delivered]: "Entregado",
  [ShippingStatus.FailedDelivery]: "Entrega fallida",
  [ShippingStatus.Returned]: "Devuelto",
  [ShippingStatus.Cancelled]: "Cancelado",
  [ShippingStatus.Exception]: "Incidencia",
};

export const detailsTitleOptions: { [key: string]: string } = {
  customer_email: "Correo electrónico del cliente",
  payment_method_type: "Tipo de método de pago",
  reference_pol: "Número de orden",
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

export const paymentMethodsByOption: {
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

export const INITIAL_PERCENTAGE_INCREASE = 100;
export const INITIAL_TRANSPORTATION_COST = 500;
export const INITIAL_MISC_COST = 500;

export const yearColors = {
  2025: "#AD8FE1",
  default: "#3498DB",
};

export const CAPSULAS_SORPRESA_ID = "3825ae1d-be71-493f-aaf3-32916c2d18b9";
export const KITS_ID = "6fd0c357-45c3-4d61-84b1-78921cfb1f21";

export const TRESHOLD_LOW_STOCK = 5;

export const paymentNames = {
  [PaymentMethod.BankTransfer]: "Transferencia Bancaria Bancolombia",
  [PaymentMethod.COD]: "Pago Contra Entrega",
  [PaymentMethod.PayU]: "Pago con PayU",
  [PaymentMethod.Wompi]: "Pago con Wompi",
};

export enum Models {
  Banners = "banners",
  MainBanner = "main-banner",
  Billboards = "billboards",
  Categories = "categories",
  Colors = "colors",
  Designs = "designs",
  Orders = "orders",
  Customers = "customers",
  Products = "products",
  Posts = "posts",
  Reviews = "reviews",
  Sizes = "sizes",
  Suppliers = "suppliers",
  Types = "types",
  LowStock = "low-stock",
  OutOfStock = "out-of-stock",
  Inventory = "inventory",
  SalesByCategory = "sales-by-category",
  Coupons = "coupons",
  Shipments = "shipments",
  Offers = "offers",
}

export const ModelLabels: Record<Models, string> = {
  [Models.Banners]: "Banners",
  [Models.MainBanner]: "Banner principal",
  [Models.Billboards]: "Billboards",
  [Models.Categories]: "Categorías",
  [Models.Colors]: "Colores",
  [Models.Designs]: "Diseños",
  [Models.Orders]: "Órdenes",
  [Models.Products]: "Productos",
  [Models.Posts]: "Publicaciones",
  [Models.Reviews]: "Reseñas",
  [Models.Sizes]: "Tamaños",
  [Models.Suppliers]: "Proveedores",
  [Models.Types]: "Tipos",
  [Models.LowStock]: "Productos por agotarse",
  [Models.OutOfStock]: "Productos completamente agotados",
  [Models.Inventory]: "Inventario",
  [Models.SalesByCategory]: "Ventas por categoría",
  [Models.Coupons]: "Cupones",
  [Models.Customers]: "Clientes",
  [Models.Shipments]: "Envíos",
  [Models.Offers]: "Ofertas",
};

export const ModelsColumns: Record<Models, { [key: string]: string }> = {
  [Models.Banners]: {
    imageUrl: "Imagen",
    callToAction: "URL de redirección",
    createdAt: "Fecha de creación",
  },
  [Models.MainBanner]: {
    imageUrl: "Imagen",
    title: "Título",
    label1: "Párrafo 1",
    highlight: "Subrayado",
    label2: "Párrafo 2",
    callToAction: "URL de redirección",
    createdAt: "Fecha de creación",
  },
  [Models.Billboards]: {
    imageUrl: "Imagen",
    label: "Etiqueta",
    title: "Título",
    redirectUrl: "Link de redirección",
    createdAt: "Fecha de creación",
  },
  [Models.Categories]: {
    name: "Nombre",
    type: "Tipo",
    products: "Productos en esta categoría",
    createdAt: "Fecha de creación",
  },
  [Models.Colors]: {
    name: "Nombre",
    value: "Valor",
    products: "Productos con este color",
    createdAt: "Fecha de creación",
  },
  [Models.Designs]: {
    name: "Nombre",
    products: "Productos con este diseño",
    createdAt: "Fecha de creación",
  },
  [Models.Orders]: {
    orderNumber: "Orden",
    products: "Productos",
    phone: "Ir a WhatsApp",
    address: "Dirección",
    paymentMethod: "Método de pago",
    totalPrice: "Precio total",
    status: "Estado de la orden",
    shippingStatus: "Estado del envío",
    createdAt: "Fecha de creación",
  },
  [Models.Customers]: {
    fullName: "Nombre completo",
    phone: "Teléfono",
    email: "Correo electrónico",
    totalOrders: "Órdenes totales",
    totalSpent: "Total gastado",
    firstOrderDate: "Primera orden",
    lastOrderDate: "Última orden",
    favoriteProducts: "Productos favoritos",
  },
  [Models.Products]: {
    image: "Imagen",
    name: "Nombre",
    price: "Precio",
    category: "Categoría",
    size: "Tamaño",
    color: "Color",
    stock: "Stock",
    design: "Diseño",
    isArchived: "Archivado",
    isFeatured: "Destacado",
    createdAt: "Fecha de creación",
  },
  [Models.Posts]: {
    social: "Red Social",
    postId: "ID de publicación",
    createdAt: "Fecha de creación",
  },
  [Models.Reviews]: {
    productImage: "Imagen del producto",
    productName: "Producto",
    userImage: "Imagen del usuario",
    name: "Nombre del usuario",
    rating: "Calificación",
    comment: "Comentarios",
    createdAt: "Fecha de creación",
  },
  [Models.Sizes]: {
    name: "Nombre",
    value: "Valor",
    products: "Productos con este tamaño",
    createdAt: "Fecha de creación",
  },
  [Models.Suppliers]: {
    name: "Nombre del proveedor",
    products: "Productos con este proveedor",
    createdAt: "Fecha de creación",
  },
  [Models.Types]: {
    name: "Nombre",
    categories: "Categorías con este tipo",
    createdAt: "Fecha de creación",
  },
  [Models.LowStock]: {
    image: "Imagen",
    name: "Nombre",
    category: "Categoría",
    stock: "Stock",
    isFeatured: "Destacado",
    isArchived: "Archivado",
    lastUpdated: "Última actualización",
  },
  [Models.OutOfStock]: {
    image: "Imagen",
    name: "Nombre",
    category: "Categoría",
    isArchived: "Archivado",
    updatedAt: "Última actualización",
  },
  [Models.Inventory]: {
    name: "Nombre",
    category: "Categoría",
    stock: "Stock",
    price: "Precio",
  },
  [Models.SalesByCategory]: {
    category: "Categoría",
    sales: "Ventas",
    orders: "Órdenes",
  },
  [Models.Coupons]: {
    code: "Código",
    type: "Tipo",
    amount: "Descuento",
    startDate: "Inicio",
    endDate: "Fin",
    usedCount: "Cantidad de usos",
    minOrderValue: "Pedido mínimo",
    isActive: "Vigencia",
    createdAt: "Fecha de creación",
  },
  [Models.Shipments]: {
    trackingCode: "Código de rastreo",
    carrierName: "Transportadora",
    status: "Estado",
    cost: "Costo",
    createdAt: "Fecha de creación",
  },
  [Models.Offers]: {
    name: "Nombre",
    type: "Tipo",
    amount: "Monto",
    startDate: "Inicio",
    endDate: "Fin",
    isActive: "Activa",
    createdAt: "Fecha de creación",
  },
};

export const ALLOWED_TRANSITIONS: Record<ShippingStatus, ShippingStatus[]> = {
  [ShippingStatus.Preparing]: [
    ShippingStatus.Shipped,
    ShippingStatus.Cancelled,
  ],
  [ShippingStatus.Shipped]: [
    ShippingStatus.PickedUp,
    ShippingStatus.InTransit,
    ShippingStatus.Cancelled,
    ShippingStatus.Exception,
  ],
  [ShippingStatus.PickedUp]: [
    ShippingStatus.InTransit,
    ShippingStatus.Exception,
    ShippingStatus.Cancelled,
  ],
  [ShippingStatus.InTransit]: [
    ShippingStatus.OutForDelivery,
    ShippingStatus.Exception,
    ShippingStatus.Returned,
  ],
  [ShippingStatus.OutForDelivery]: [
    ShippingStatus.Delivered,
    ShippingStatus.FailedDelivery,
    ShippingStatus.Exception,
  ],
  [ShippingStatus.Delivered]: [ShippingStatus.Returned],
  [ShippingStatus.FailedDelivery]: [
    ShippingStatus.OutForDelivery,
    ShippingStatus.Returned,
    ShippingStatus.Exception,
  ],
  [ShippingStatus.Returned]: [ShippingStatus.Preparing],
  [ShippingStatus.Cancelled]: [],
  [ShippingStatus.Exception]: [
    ShippingStatus.InTransit,
    ShippingStatus.OutForDelivery,
    ShippingStatus.Returned,
    ShippingStatus.Cancelled,
  ],
};

export const POPULAR_CITY_CODES = [
  "11001000", // Bogotá D.C.
  "05001000", // Medellín
  "76001000", // Cali
  "08001000", // Barranquilla
  "13001000", // Cartagena
  "54001000", // Cúcuta
  "68001000", // Bucaramanga
  "66001000", // Pereira
  "17001000", // Manizales
  "73001000", // Ibagué
];
