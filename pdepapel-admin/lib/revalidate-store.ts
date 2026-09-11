import axios, { isAxiosError } from "axios";

import { sendRevalidationFailureAlert } from "@/lib/revalidation-alert";
import { recordJobRun } from "@/lib/job-runs";

const REVALIDATION_TIMEOUT_MS = 3000;
const RETRY_DELAY_MS = 400;

/**
 * Texto para la alerta y el registro del trabajo: dice de dónde vino el fallo.
 * Un 429 sin llegar a la función (Vercel Firewall: Bot Protection o Attack
 * Challenge Mode) no es carga: es un desafío que un servidor no puede resolver.
 */
export function describeRevalidationFailure(error: unknown): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const mitigated = error.response?.headers?.["x-vercel-mitigated"];
    if (typeof mitigated === "string" && mitigated) {
      return `HTTP ${status ?? "?"}: el firewall de Vercel de la tienda respondió con «${mitigated}» en vez de ejecutar /api/revalidate. Bot Protection o Attack Challenge Mode están desafiando la llamada servidor a servidor del panel: añade una regla de bypass para la ruta /api/revalidate (o baja Bot Protection a «Log») en Vercel › pdepapel-store › Firewall.`;
    }
    if (status !== undefined) {
      const body = error.response?.data;
      const message =
        body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
          ? ` (${(body as { message: string }).message})`
          : "";
      return `HTTP ${status}${message}`;
    }
    return error.code === "ECONNABORTED"
      ? `Sin respuesta en ${REVALIDATION_TIMEOUT_MS} ms`
      : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Un fallo de red o un 5xx puede pasar en el segundo intento; un 4xx no. */
function isTransientFailure(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status >= 500;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RevalidateParams {
  productId?: string;
  path?: string;
  paths?: string[];
  tag?: string;
  tags?: string[];
}

/**
 * Triggers On-Demand Revalidation on pdepapel-store whenever public catalog
 * content changes.
 */
export async function triggerStorefrontRevalidation(
  params: RevalidateParams = {},
): Promise<void> {
  try {
    const storefrontUrl =
      process.env.NEXT_PUBLIC_STOREFRONT_URL ||
      process.env.STOREFRONT_URL ||
      "https://papeleriapdepapel.com";

    const secret = process.env.REVALIDATION_SECRET?.trim();

    if (!secret) {
      const message =
        "Storefront revalidation skipped: REVALIDATION_SECRET is not configured.";
      console.warn(message);
      await recordJobRun("storefront-revalidation", {
        ok: false,
        detail: message,
      });
      await sendRevalidationFailureAlert({
        endpoints: [storefrontUrl],
        details: [message],
      });
      return;
    }

    if (!/^[\x21-\x7e]+$/.test(secret)) {
      const message =
        "Storefront revalidation skipped: REVALIDATION_SECRET must be a single-line printable value.";
      console.warn(message);
      await sendRevalidationFailureAlert({
        endpoints: [storefrontUrl],
        details: [message],
      });
      return;
    }

    // In local dev mode, also attempt local store revalidation if on localhost
    const isDev = process.env.NODE_ENV === "development";
    const urlsToCall = [storefrontUrl];

    if (isDev && !storefrontUrl.includes("localhost:3000")) {
      urlsToCall.push("http://localhost:3000");
    }

    const post = (endpoint: string) =>
      axios.post(
        endpoint,
        {
          productId: params.productId,
          path: params.path,
          paths: params.paths,
          tag: params.tag,
          tags: params.tags || ["products"],
        },
        {
          headers: {
            "x-revalidate-secret": secret,
            "Content-Type": "application/json",
          },
          timeout: REVALIDATION_TIMEOUT_MS,
        },
      );

    const results = await Promise.allSettled(
      urlsToCall.map(async (baseUrl) => {
        const endpoint = `${baseUrl.replace(/\/$/, "")}/api/revalidate`;
        try {
          return await post(endpoint);
        } catch (error) {
          if (!isTransientFailure(error)) throw error;
          await wait(RETRY_DELAY_MS);
          return post(endpoint);
        }
      }),
    );

    const failures: { endpoint: string; detail: string }[] = [];

    results.forEach((result, index) => {
      const endpoint = `${urlsToCall[index].replace(/\/$/, "")}/api/revalidate`;
      if (result.status === "fulfilled") {
        console.log(
          `⚡ Storefront revalidated on ${endpoint}:`,
          result.value.data,
        );
        return;
      }
      const detail = describeRevalidationFailure(result.reason);
      console.warn(`⚠️ Storefront revalidation failed on ${endpoint}:`, detail);
      failures.push({ endpoint, detail });
    });

    if (failures.length > 0) {
      await sendRevalidationFailureAlert({
        endpoints: failures.map((failure) => failure.endpoint),
        details: failures.map((failure) => failure.detail),
      });
    }
    // Solo cuenta la tienda pública: el fallo de localhost en desarrollo no es noticia.
    const publicFailure = failures.find(
      (failure) => !failure.endpoint.includes("localhost"),
    );
    await recordJobRun("storefront-revalidation", {
      ok: !publicFailure,
      detail: publicFailure
        ? `${publicFailure.endpoint}: ${publicFailure.detail}`
        : `Actualizada ${(params.tags ?? [params.tag ?? "products"]).filter(Boolean).join(", ")}`,
    });
  } catch (error) {
    console.error("Error triggering storefront revalidation:", error);
    await recordJobRun("storefront-revalidation", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    await sendRevalidationFailureAlert({
      endpoints: ["storefront revalidation"],
      details: [error instanceof Error ? error.message : String(error)],
    });
  }
}
