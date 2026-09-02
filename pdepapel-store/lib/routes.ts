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
  newsletterConfirm: "/suscripcion/confirmar",
  newsletterUnsubscribe: "/suscripcion/cancelar",
} as const;

const STOREFRONT_ORIGIN = "https://papeleriapdepapel.com";

type AuthRoute =
  | typeof STOREFRONT_ROUTES.signIn
  | typeof STOREFRONT_ROUTES.signUp;

export function getSafeStorefrontRedirectPath(
  redirectPath: string | string[] | null | undefined,
  fallbackPath = STOREFRONT_ROUTES.home,
): string {
  const normalizedRedirectPath = Array.isArray(redirectPath)
    ? redirectPath[0]
    : redirectPath;

  if (
    !normalizedRedirectPath ||
    !normalizedRedirectPath.startsWith("/") ||
    normalizedRedirectPath.startsWith("//") ||
    normalizedRedirectPath.includes("\\")
  ) {
    return fallbackPath;
  }

  try {
    const parsedPath = new URL(normalizedRedirectPath, STOREFRONT_ORIGIN);

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

export function canonicalStorefrontHref(
  href: string | null | undefined,
  fallback = STOREFRONT_ROUTES.home,
): string {
  const normalizedHref = href?.trim();

  if (!normalizedHref) return fallback;

  if (
    normalizedHref === "/shop" ||
    normalizedHref.startsWith("/shop?") ||
    normalizedHref.startsWith("/shop#")
  ) {
    return `${STOREFRONT_ROUTES.shop}${normalizedHref.slice(5)}`;
  }

  try {
    const url = new URL(normalizedHref);
    if (url.origin === STOREFRONT_ORIGIN && url.pathname === "/shop") {
      return `${STOREFRONT_ROUTES.shop}${url.search}${url.hash}`;
    }
  } catch {
    return normalizedHref;
  }

  return normalizedHref;
}
