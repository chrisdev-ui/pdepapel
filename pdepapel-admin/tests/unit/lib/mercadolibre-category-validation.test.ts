import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestMercadoLibreJson: vi.fn(),
}));

vi.mock("@/lib/mercadolibre/client", () => ({
  requestMercadoLibreJson: mocks.requestMercadoLibreJson,
}));

import {
  MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
  MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
} from "@/lib/mercadolibre/categories";
import { inspectMercadoLibreCategory } from "@/lib/mercadolibre/category-validation";

describe("Mercado Libre category validation", () => {
  beforeEach(() => {
    mocks.requestMercadoLibreJson.mockReset();
  });

  it("marks a removed category as reviewable instead of throwing a generic error", async () => {
    mocks.requestMercadoLibreJson.mockResolvedValueOnce({
      ok: false,
      status: 404,
      payload: { message: "Category not found" },
    });

    await expect(
      inspectMercadoLibreCategory("connection-1", "mco1234", {
        includeAttributes: true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      categoryId: "MCO1234",
      code: MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
      upstreamStatus: 404,
      message: expect.stringContaining("ya no está disponible"),
    });
    expect(mocks.requestMercadoLibreJson).toHaveBeenCalledOnce();
  });

  it("validates the final category and returns its editable attributes", async () => {
    mocks.requestMercadoLibreJson
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        payload: {
          id: "MCO1234",
          children_categories: [],
          settings: { listing_allowed: true, item_conditions: ["new"] },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        payload: [
          {
            id: "BRAND",
            name: "Marca",
            value_type: "string",
            tags: { required: true },
          },
        ],
      });

    await expect(
      inspectMercadoLibreCategory("connection-1", "MCO1234", {
        includeAttributes: true,
      }),
    ).resolves.toEqual({
      ok: true,
      categoryId: "MCO1234",
      attributes: [
        {
          id: "BRAND",
          name: "Marca",
          required: true,
          valueType: "string",
          values: [],
        },
      ],
    });
  });

  it("distinguishes an expired authorization from a stale category", async () => {
    mocks.requestMercadoLibreJson.mockResolvedValueOnce({
      ok: false,
      status: 401,
      payload: { message: "Unauthorized" },
    });

    await expect(
      inspectMercadoLibreCategory("connection-1", "MCO1234"),
    ).resolves.toMatchObject({
      ok: false,
      code: MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
      upstreamStatus: 401,
      message: expect.stringContaining("Reconecta"),
    });
  });
});
