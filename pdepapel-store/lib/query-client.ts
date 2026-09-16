import {
  QueryClient,
  type DefaultedQueryObserverOptions,
  type DefaultError,
  type QueryKey,
  type QueryObserverOptions,
} from "@tanstack/react-query";

/**
 * Ceiling for a single query attempt. Generous on purpose: it is a safety net
 * for a request that will never answer, not a latency budget for slow ones.
 */
export const QUERY_TIMEOUT_MS = 30_000;

export class QueryTimeoutError extends Error {
  constructor(timeoutMs: number = QUERY_TIMEOUT_MS) {
    super(
      `La consulta superó ${Math.round(timeoutMs / 1000)} segundos sin responder.`,
    );
    this.name = "QueryTimeoutError";
  }
}

type Bounded = { __bounded?: true };

const isBounded = (fn: unknown): boolean =>
  typeof fn === "function" && (fn as Bounded).__bounded === true;

/**
 * Wraps every query's function in a timeout.
 *
 * A promise that neither resolves nor rejects leaves its query at
 * `fetchStatus: "fetching"` forever — no error, no retry, nothing to recover
 * from except a reload. That is what the catalog filters hit: `getProducts` is
 * a server action, and one queued behind an in-flight action while the router
 * navigates is simply dropped. Bounding it here turns "hangs forever" into an
 * ordinary failed query the UI already knows how to handle.
 *
 * Mutations are deliberately untouched: checkout, shipping quotes and coupon
 * validation run through those, and they own their own error handling.
 */
export class BoundedQueryClient extends QueryClient {
  defaultQueryOptions<
    TQueryFnData = unknown,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = never,
  >(
    options?:
      | QueryObserverOptions<
          TQueryFnData,
          TError,
          TData,
          TQueryData,
          TQueryKey,
          TPageParam
        >
      | DefaultedQueryObserverOptions<
          TQueryFnData,
          TError,
          TData,
          TQueryData,
          TQueryKey
        >,
  ): DefaultedQueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  > {
    const merged = super.defaultQueryOptions(options);
    const original = merged.queryFn;

    // `skipToken` is not a function, and an already-wrapped one must not nest.
    if (typeof original !== "function" || isBounded(original)) return merged;

    // Never let an unset field turn into setTimeout(fn, undefined) === 0ms.
    const timeoutMs = this.timeoutMs ?? QUERY_TIMEOUT_MS;
    const bounded = (...args: Parameters<typeof original>) =>
      new Promise<TQueryFnData>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new QueryTimeoutError(timeoutMs)),
          timeoutMs,
        );
        Promise.resolve(original(...args))
          .then(resolve, reject)
          .finally(() => clearTimeout(timer));
      });
    (bounded as Bounded).__bounded = true;

    return { ...merged, queryFn: bounded as typeof original };
  }

  private readonly timeoutMs: number;

  constructor({
    timeoutMs = QUERY_TIMEOUT_MS,
    ...config
  }: ConstructorParameters<typeof QueryClient>[0] & {
    timeoutMs?: number;
  } = {}) {
    super({
      ...config,
      defaultOptions: {
        ...config.defaultOptions,
        queries: {
          // Same three attempts as before for real errors. A timeout is
          // terminal: re-running a request that already hung only keeps the
          // page waiting longer.
          retry: (failureCount: number, error: Error) =>
            !(error instanceof QueryTimeoutError) && failureCount < 3,
          ...config.defaultOptions?.queries,
        },
      },
    });
    this.timeoutMs = timeoutMs;
  }
}

export const createQueryClient = (timeoutMs?: number) =>
  new BoundedQueryClient(timeoutMs === undefined ? {} : { timeoutMs });
