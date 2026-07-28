import axios from "axios";

interface RevalidateParams {
  productId?: string;
  path?: string;
  tag?: string;
}

/**
 * Triggers instant On-Demand Revalidation on pdepapel-store (sub-500ms Edge CDN cache purge)
 * Whenever an admin creates/updates a product, variant, stock, or inventory movement.
 */
export async function triggerStorefrontRevalidation(
  params: RevalidateParams = {},
): Promise<void> {
  try {
    const storefrontUrl =
      process.env.NEXT_PUBLIC_STOREFRONT_URL ||
      process.env.STOREFRONT_URL ||
      "https://papeleriapdepapel.com";

    const secret =
      process.env.REVALIDATION_SECRET || "pdepapel_revalidate_secret_2026";

    // In local dev mode, also attempt local store revalidation if on localhost
    const isDev = process.env.NODE_ENV === "development";
    const urlsToCall = [storefrontUrl];

    if (isDev && !storefrontUrl.includes("localhost:3000")) {
      urlsToCall.push("http://localhost:3000");
    }

    for (const baseUrl of urlsToCall) {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/api/revalidate`;

      axios
        .post(
          endpoint,
          {
            productId: params.productId,
            path: params.path,
            tag: params.tag || "products",
          },
          {
            headers: {
              "x-revalidate-secret": secret,
              "Content-Type": "application/json",
            },
            timeout: 3000, // Non-blocking 3s timeout
          },
        )
        .then((res) => {
          console.log(
            `⚡ Storefront revalidation triggered on ${endpoint}:`,
            res.data,
          );
        })
        .catch((err) => {
          // Non-blocking log
          console.log(
            `⚠️ Storefront revalidation dispatch to ${endpoint} returned:`,
            err.message,
          );
        });
    }
  } catch (error) {
    console.error("Error triggering storefront revalidation:", error);
  }
}
