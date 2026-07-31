import {
  AppError,
  ErrorFactory,
  getErrorMessage,
  handleErrorResponse,
} from "@/lib/api-errors";
import { afterEach, describe, expect, it, vi } from "vitest";

const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  consoleError.mockClear();
});

describe("API error helpers", () => {
  it("creates consistent business errors with actionable metadata", () => {
    expect(ErrorFactory.InvalidRequest()).toMatchObject({ statusCode: 400 });
    expect(ErrorFactory.MissingStoreId()).toMatchObject({ statusCode: 400 });
    expect(ErrorFactory.Unauthenticated()).toMatchObject({ statusCode: 401 });
    expect(ErrorFactory.Unauthorized()).toMatchObject({ statusCode: 403 });
    expect(ErrorFactory.NotFound("Producto no encontrado")).toMatchObject({
      statusCode: 404,
    });
    expect(ErrorFactory.Conflict()).toMatchObject({ statusCode: 409 });
    expect(ErrorFactory.TooManyRequests()).toMatchObject({ statusCode: 429 });
    expect(ErrorFactory.OrderLimit()).toMatchObject({ statusCode: 429 });
    expect(ErrorFactory.InsufficientStock("Agenda", 1, 2)).toMatchObject({
      statusCode: 422,
      details: { productName: "Agenda", available: 1, requested: 2 },
    });
    expect(
      ErrorFactory.MultipleInsufficientStock([
        {
          productId: "product-id",
          productName: "Agenda",
          available: 1,
          requested: 2,
        },
      ]),
    ).toMatchObject({ statusCode: 422 });
    expect(
      ErrorFactory.CloudinaryError({ message: "Upload failed", status: 503 }),
    ).toMatchObject({ statusCode: 503 });
    expect(ErrorFactory.InternalServerError()).toMatchObject({
      statusCode: 500,
    });
  });

  it("serializes known application errors without exposing internal failures", async () => {
    const response = handleErrorResponse(
      new AppError("Stock insuficiente", 422, { productId: "product-id" }),
      "create order",
      { headers: { "x-request-id": "request-id" } },
    );

    expect(response.status).toBe(422);
    expect(response.headers.get("x-request-id")).toBe("request-id");
    await expect(response.json()).resolves.toEqual({
      error: "Stock insuficiente",
      details: { productId: "product-id" },
    });
  });

  it("returns a safe generic response for unexpected errors", async () => {
    const response = handleErrorResponse(new Error("database password"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Error interno del servidor",
    });
  });

  it("extracts useful messages from Axios and standard errors", () => {
    expect(
      getErrorMessage({
        isAxiosError: true,
        message: "Request failed",
        response: {
          data: {
            error: "Dirección inválida",
            details: { message: "Código postal" },
          },
        },
      }),
    ).toBe("Dirección inválida: Código postal");
    expect(getErrorMessage(new Error("No se pudo guardar"))).toBe(
      "No se pudo guardar",
    );
  });
});
