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

const STOREFRONT_ORIGIN = "https://papeleriapdepapel.com";

type AuthRoute =
  | typeof STOREFRONT_ROUTES.signIn
  | typeof STOREFRONT_ROUTES.signUp;

export function getSafeStorefrontRedirectPath(
  redirectPath: string | null | undefined,
  fallbackPath = STOREFRONT_ROUTES.home,
): string {
  if (
    !redirectPath ||
    !redirectPath.startsWith("/") ||
    redirectPath.startsWith("//") ||
    redirectPath.includes("\\")
  ) {
    return fallbackPath;
  }

  try {
    const parsedPath = new URL(redirectPath, STOREFRONT_ORIGIN);

    if (parsedPath.origin !== STOREFRONT_ORIGIN) {
      return fallbackPath;
    }

    const isAuthenticationPath = [
      STOREFRONT_ROUTES.signIn,
      STOREFRONT_ROUTES.signUp,
      "/sign-in",
      "/sign-up",
    ].some((authPath) => parsedPath.pathname.startsWith(authPath));

    if (isAuthenticationPath) {
      return fallbackPath;
    }

    return `${parsedPath.pathname}${parsedPath.search}${parsedPath.hash}`;
  } catch {
    return fallbackPath;
  }
}

export function accountAccessPath(
  destination: AuthRoute,
  redirectPath: string | null | undefined,
): string {
  const safeRedirectPath = getSafeStorefrontRedirectPath(redirectPath);

  return `${destination}?redirect_url=${encodeURIComponent(safeRedirectPath)}`;
}

export const productPath = (slug: string) => `/producto/${slug}`;

export const categoryPath = (slug: string) => `/categoria/${slug}`;

export const orderPath = (orderId: string) => `/pedido/${orderId}`;

export const quotePath = (token: string) => `/cotizacion/${token}`;
