import axios from "axios";

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

    const secret = process.env.REVALIDATION_SECRET;

    if (!secret) {
      console.warn(
        "Storefront revalidation skipped: REVALIDATION_SECRET is not configured.",
      );
      return;
    }

    // In local dev mode, also attempt local store revalidation if on localhost
    const isDev = process.env.NODE_ENV === "development";
    const urlsToCall = [storefrontUrl];

    if (isDev && !storefrontUrl.includes("localhost:3000")) {
      urlsToCall.push("http://localhost:3000");
    }

    const results = await Promise.allSettled(
      urlsToCall.map((baseUrl) => {
        const endpoint = `${baseUrl.replace(/\/$/, "")}/api/revalidate`;

        return axios.post(
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
            timeout: 3000,
          },
        );
      }),
    );

    results.forEach((result, index) => {
      const endpoint = `${urlsToCall[index].replace(/\/$/, "")}/api/revalidate`;
      if (result.status === "fulfilled") {
        console.log(
          `⚡ Storefront revalidated on ${endpoint}:`,
          result.value.data,
        );
        return;
      }
      console.warn(
        `⚠️ Storefront revalidation failed on ${endpoint}:`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
    });
  } catch (error) {
    console.error("Error triggering storefront revalidation:", error);
  }
}
