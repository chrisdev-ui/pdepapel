export const STOREFRONT_ROUTES = {
  home: "/",
  about: "/nosotros",
  shop: "/tienda",
  contact: "/contacto",
  cart: "/carrito",
  checkout: "/finalizar-compra",
  wishlist: "/favoritos",
  myOrders: "/mis-pedidos",
  signIn: "/iniciar-sesion",
  signUp: "/crear-cuenta",
  dataPolicy: "/politicas/privacidad",
  returnsPolicy: "/politicas/devoluciones",
  shippingPolicy: "/politicas/envios",
} as const;

export const productPath = (slug: string) => `/producto/${slug}`;

export const orderPath = (orderId: string) => `/pedido/${orderId}`;

export const quotePath = (token: string) => `/cotizacion/${token}`;
