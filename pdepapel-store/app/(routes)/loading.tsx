import { Loader } from "@/components/loader";

/**
 * Instant loading state for storefront navigations.
 *
 * Segments with their own skeleton (tienda, categoria, finalizar-compra,
 * mis-pedidos) override this; every other route shows the branded loader
 * while its server payload streams in.
 */
export default function Loading() {
  return <Loader label="Un momento" />;
}
