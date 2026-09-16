import { describe, expect, it } from "vitest";

import { createQueryClient, QueryTimeoutError } from "@/lib/query-client";

/**
 * The catalog filters could leave a query at `fetchStatus: "fetching"` with no
 * error and no retry, forever: `getProducts` is a server action, and one queued
 * behind an in-flight action while the router navigates is dropped, so its
 * promise never settles. These tests pin the safety net that bounds it.
 */
describe("bounded query client", () => {
  const TIMEOUT = 50;

  it("fails a query whose promise never settles instead of hanging", async () => {
    const client = createQueryClient(TIMEOUT);

    await expect(
      client.fetchQuery({
        queryKey: ["never-settles"],
        queryFn: () => new Promise(() => {}),
        retry: false,
      }),
    ).rejects.toBeInstanceOf(QueryTimeoutError);

    const state = client.getQueryCache().find({ queryKey: ["never-settles"] })
      ?.state;
    expect(state?.status).toBe("error");
    expect(state?.fetchStatus).toBe("idle");
  });

  it("leaves a normal query untouched", async () => {
    const client = createQueryClient(TIMEOUT);

    await expect(
      client.fetchQuery({
        queryKey: ["fast"],
        queryFn: async () => "listo",
      }),
    ).resolves.toBe("listo");
  });

  it("still surfaces a real rejection as itself, not as a timeout", async () => {
    const client = createQueryClient(TIMEOUT);

    await expect(
      client.fetchQuery({
        queryKey: ["explodes"],
        queryFn: async () => {
          throw new Error("la API respondió 500");
        },
        retry: false,
      }),
    ).rejects.toThrow("la API respondió 500");
  });

  it("does not retry a timeout, so a hung request is not hung again", async () => {
    const client = createQueryClient(TIMEOUT);
    let attempts = 0;

    await expect(
      client.fetchQuery({
        queryKey: ["hangs-every-time"],
        queryFn: () => {
          attempts += 1;
          return new Promise(() => {});
        },
      }),
    ).rejects.toBeInstanceOf(QueryTimeoutError);

    expect(attempts).toBe(1);
  });

  it("still retries an ordinary failure the usual three times", async () => {
    const client = createQueryClient(TIMEOUT);
    let attempts = 0;

    await expect(
      client.fetchQuery({
        queryKey: ["flaky"],
        queryFn: async () => {
          attempts += 1;
          throw new Error("se cayó la red");
        },
        retryDelay: 0,
      }),
    ).rejects.toThrow("se cayó la red");

    expect(attempts).toBe(4); // the first attempt plus three retries
  });

  it("does not stack a new timeout wrapper on every render", async () => {
    const client = createQueryClient(TIMEOUT);
    const queryFn = async () => "once";

    const first = client.defaultQueryOptions({ queryKey: ["stable"], queryFn });
    const second = client.defaultQueryOptions({
      queryKey: ["stable"],
      queryFn: first.queryFn,
    });

    expect(second.queryFn).toBe(first.queryFn);
  });
});
