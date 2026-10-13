import { Loader } from "@/components/loader";

/**
 * Instant loading state for the account routes (sign in, sign up, orders).
 *
 * Deliberately scoped to this group: a segment-level loading boundary streams
 * the shell before the page runs, which would lock the HTTP status at 200 for
 * routes that call notFound() (product, category, order). Those keep their
 * own skeletons or none. mis-pedidos overrides this with its order skeleton.
 */
export default function Loading() {
  return <Loader label="Un momento" />;
}
