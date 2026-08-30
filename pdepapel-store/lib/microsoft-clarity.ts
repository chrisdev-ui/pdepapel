type ClarityClient = typeof import("@microsoft/clarity").default;

const CLARITY_PROJECT_ID_PATTERN = /^[a-z0-9]+$/i;
const MAX_QUEUED_EVENTS = 40;

const TRACKED_CLARITY_EVENTS = new Set([
  "account_registration_cta_clicked",
  "account_sign_in_cta_clicked",
  "add_payment_info",
  "add_shipping_info",
  "add_to_cart",
  "begin_checkout",
  "cart_preview_action",
  "cart_preview_dismiss",
  "cart_preview_view",
  "catalog_filter",
  "catalog_no_results",
  "catalog_search",
  "checkout_initiated",
  "checkout_order_submitted",
  "checkout_payment_redirect_failed",
  "checkout_payment_redirect",
  "checkout_step_view",
  "checkout_stock_unavailable",
  "checkout_submit_failed",
  "checkout_validation_error",
  "select_category",
  "select_item",
  "select_item_variant",
  "shipping_quote_failed",
  "shipping_quote_no_results",
  "shipping_quote_requested",
  "shipping_quote_succeeded",
  "view_cart",
  "view_item",
  "view_item_list",
]);

const CHECKOUT_STEP_BY_EVENT: Record<string, string> = {
  begin_checkout: "inicio",
  add_shipping_info: "envio",
  add_payment_info: "pago",
  checkout_stock_unavailable: "stock_no_disponible",
  checkout_order_submitted: "pedido_enviado",
  checkout_payment_redirect: "redireccion_pago",
  shipping_quote_failed: "envio",
  shipping_quote_no_results: "envio",
  shipping_quote_requested: "envio",
  shipping_quote_succeeded: "envio",
};

const SAFE_CHECKOUT_STEP_TAGS = new Set([
  "envio",
  "informacion",
  "pago",
  "revision",
]);

type QueuedClarityEvent = {
  checkoutStep?: string;
  eventName: string;
};

const SENSITIVE_ROUTE_PREFIXES = [
  "/cotizacion/",
  "/crear-cuenta",
  "/iniciar-sesion",
  "/mis-pedidos",
  "/pedido/",
];

let clarityClient: ClarityClient | null = null;
let initializationPromise: Promise<boolean> | null = null;
let configuredProjectId: string | null = null;
let isConfiguredEnabled = false;
let hasConsent = false;
let currentPathname = "/";
let queuedEvents: QueuedClarityEvent[] = [];

export type ClarityRouteGroup =
  | "carrito"
  | "categoria"
  | "finalizar_compra"
  | "inicio"
  | "producto"
  | "tienda"
  | "no_medida";

function hasValidProjectId(projectId?: string): projectId is string {
  return Boolean(projectId && CLARITY_PROJECT_ID_PATTERN.test(projectId));
}

export function getClarityRouteGroup(pathname: string): ClarityRouteGroup {
  if (pathname === "/") return "inicio";
  if (pathname === "/tienda") return "tienda";
  if (pathname.startsWith("/categoria/")) return "categoria";
  if (pathname.startsWith("/producto/")) return "producto";
  if (pathname === "/carrito") return "carrito";
  if (pathname === "/finalizar-compra") return "finalizar_compra";
  return "no_medida";
}

export function isClarityEligiblePath(pathname: string): boolean {
  return getClarityRouteGroup(pathname) !== "no_medida";
}

export function shouldMaskClarityPage(pathname: string): boolean {
  return SENSITIVE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

function canCollect(): boolean {
  return Boolean(
    isConfiguredEnabled &&
    configuredProjectId &&
    hasConsent &&
    isClarityEligiblePath(currentPathname),
  );
}

function applyConsent(client: ClarityClient, granted: boolean): void {
  client.consentV2({
    ad_Storage: "denied",
    analytics_Storage: granted ? "granted" : "denied",
  });
}

function applyRouteTags(client: ClarityClient): void {
  client.setTag("route_group", getClarityRouteGroup(currentPathname));
  client.setTag("consent_version", "v2");
}

function getCheckoutStepTag(
  eventName: string,
  parameters: Record<string, unknown>,
): string | undefined {
  const parameterStep = parameters.checkout_step_name;
  if (
    typeof parameterStep === "string" &&
    SAFE_CHECKOUT_STEP_TAGS.has(parameterStep)
  ) {
    return parameterStep;
  }

  return CHECKOUT_STEP_BY_EVENT[eventName];
}

function getClarityEventName(
  eventName: string,
  parameters: Record<string, unknown>,
): string {
  if (eventName !== "cart_preview_dismiss") return eventName;

  const reason = parameters.reason;
  return reason === "auto" || reason === "manual"
    ? `${eventName}_${reason}`
    : eventName;
}

function flushQueuedEvents(client: ClarityClient): void {
  const events = queuedEvents;
  queuedEvents = [];

  for (const { checkoutStep, eventName } of events) {
    if (checkoutStep) client.setTag("checkout_step", checkoutStep);
    client.event(eventName);
  }
}

export function configureMicrosoftClarity({
  enabled,
  projectId,
}: {
  enabled: boolean;
  projectId?: string;
}): void {
  isConfiguredEnabled = enabled && hasValidProjectId(projectId);
  configuredProjectId = isConfiguredEnabled && projectId ? projectId : null;

  if (!isConfiguredEnabled) {
    queuedEvents = [];
    if (clarityClient) applyConsent(clarityClient, false);
  }
}

export function updateMicrosoftClarityContext({
  analyticsConsent,
  pathname,
}: {
  analyticsConsent: boolean;
  pathname: string;
}): void {
  hasConsent = analyticsConsent;
  currentPathname = pathname || "/";

  if (!canCollect()) {
    queuedEvents = [];
    if (clarityClient) applyConsent(clarityClient, false);
    return;
  }

  if (clarityClient) {
    applyConsent(clarityClient, true);
    applyRouteTags(clarityClient);
  }
}

export async function initializeMicrosoftClarity(): Promise<boolean> {
  if (!canCollect() || !configuredProjectId) return false;

  if (clarityClient) {
    applyConsent(clarityClient, true);
    applyRouteTags(clarityClient);
    flushQueuedEvents(clarityClient);
    return true;
  }

  if (initializationPromise) return initializationPromise;

  initializationPromise = import("@microsoft/clarity")
    .then(({ default: client }) => {
      if (!canCollect() || !configuredProjectId) return false;

      client.init(configuredProjectId);
      clarityClient = client;
      applyConsent(client, true);
      applyRouteTags(client);
      flushQueuedEvents(client);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      initializationPromise = null;
    });

  return initializationPromise;
}

export function trackMicrosoftClarityEvent(
  eventName: string,
  parameters: Record<string, unknown> = {},
): void {
  if (!TRACKED_CLARITY_EVENTS.has(eventName) || !canCollect()) return;

  const checkoutStep = getCheckoutStepTag(eventName, parameters);
  const clarityEventName = getClarityEventName(eventName, parameters);

  if (!clarityClient) {
    if (queuedEvents.length < MAX_QUEUED_EVENTS) {
      queuedEvents.push({ checkoutStep, eventName: clarityEventName });
    }
    return;
  }

  if (checkoutStep) clarityClient.setTag("checkout_step", checkoutStep);
  clarityClient.event(clarityEventName);
}
