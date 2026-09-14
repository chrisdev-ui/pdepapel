import {
  AppError,
  ErrorFactory,
  getErrorMessage,
  handleErrorResponse,
} from "@/lib/api-errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

afterEach(() => {
  consoleError.mockClear();
  consoleInfo.mockClear();
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

  it("turns a validation failure into 400 with the field's own message", async () => {
    // Antes caía en el 500 genérico: quien usaba el panel leía «Error interno
    // del servidor» por escribir mal una fecha. Se descubrió con las
    // preventas, pero afectaba a toda ruta que validara con .parse().
    const schema = z.object({
      expectedArrivalAt: z.string({ required_error: "Ponle la fecha en que llega" }),
      unitLimit: z.number().min(1, "Promete al menos una unidad"),
    });

    let capturado: unknown;
    try {
      schema.parse({ unitLimit: 0 });
    } catch (error) {
      capturado = error;
    }

    const response = handleErrorResponse(capturado, "crear preventa");

    expect(response.status).toBe(400);
    const cuerpo = (await response.json()) as { error: string; details?: { fieldErrors?: Record<string, string[]> } };
    // El PRIMER problema es el que se muestra, como en las rutas con safeParse.
    expect(cuerpo.error).toBe("Ponle la fecha en que llega");
    // Y el resto queda por campo, para pintarlo junto a cada casilla.
    expect(cuerpo.details?.fieldErrors).toMatchObject({
      unitLimit: ["Promete al menos una unidad"],
    });
  });

  it("translates zod's English «Required» but never overrides a written message", async () => {
    const sinMensaje = z.object({ productId: z.string() });
    const conMensaje = z.object({ productId: z.string({ required_error: "Elige el producto" }) });

    const leer = async (schema: z.ZodTypeAny) => {
      try {
        schema.parse({});
      } catch (error) {
        const r = handleErrorResponse(error, "test");
        return ((await r.json()) as { error: string }).error;
      }
      throw new Error("debió fallar");
    };

    expect(await leer(sinMensaje)).toBe("Falta el campo «productId»");
    // Pisar el mensaje del esquema cambiaría textos ya probados en producción.
    expect(await leer(conMensaje)).toBe("Elige el producto");
  });

  it("keeps an unexpected error generic even if it carries zod-looking data", async () => {
    const response = handleErrorResponse(new Error("Required"), "test");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Error interno del servidor" });
  });

  it("returns a safe generic response for unexpected errors", async () => {
    const response = handleErrorResponse(new Error("database password"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Error interno del servidor",
    });
  });

  it("answers a pool timeout with 503 and Retry-After instead of a generic 500", async () => {
    const { Prisma } = await import("@prisma/client");
    const timeout = new Prisma.PrismaClientKnownRequestError("Timed out fetching a new connection from the connection pool", {
      code: "P2024",
      clientVersion: "6.19.1",
    });
    const response = handleErrorResponse(timeout, "PRODUCTS_GET", { headers: { "x-request-id": "r1" } });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("2");
    expect(response.headers.get("x-request-id")).toBe("r1");
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("ocupada") });
  });

  it("answers a connection closed by the server (P1017) with 503 and a longer Retry-After", async () => {
    const { Prisma } = await import("@prisma/client");
    const closed = new Prisma.PrismaClientKnownRequestError("Server has closed the connection.", { code: "P1017", clientVersion: "6.19.1" });
    const response = handleErrorResponse(closed, "CATEGORIES_GET");

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("conectar") });
  });

  it("answers an unreachable database with 503", async () => {
    const { Prisma } = await import("@prisma/client");
    const down = new Prisma.PrismaClientInitializationError("Can't reach database server", "6.19.1");
    const response = handleErrorResponse(down, "PRODUCTS_GET");

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
  });

  it("logs explicitly expected application responses without an error stack", async () => {
    const response = handleErrorResponse(
      ErrorFactory.NotFound("Producto no encontrado"),
      "PRODUCT_GET",
      {
        expectedStatusCodes: [404],
        logMetadata: {
          requestSource: "storefront",
          productReference: "producto-archivado",
        },
      },
    );

    expect(response.status).toBe(404);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledWith(
      "Expected response in [PRODUCT_GET]:",
      {
        statusCode: 404,
        message: "Producto no encontrado",
        requestSource: "storefront",
        productReference: "producto-archivado",
      },
    );
  });

  it("keeps unexpected not-found responses visible as errors", () => {
    handleErrorResponse(
      ErrorFactory.NotFound("Producto no encontrado"),
      "PRODUCT_GET",
    );

    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleInfo).not.toHaveBeenCalled();
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

  it("handles timeout and network connection errors gracefully", () => {
    expect(
      getErrorMessage({
        isAxiosError: true,
        code: "ECONNABORTED",
        message: "timeout of 10000ms exceeded",
      }),
    ).toBe(
      "La solicitud tardó más de lo esperado en responder. Es posible que la operación se haya completado en el servidor; por favor recarga la página para verificar.",
    );

    expect(
      getErrorMessage({
        isAxiosError: true,
        code: "ERR_NETWORK",
        message: "Network Error",
      }),
    ).toBe(
      "Error de conexión con el servidor. Por favor verifica tu conexión a internet.",
    );

    expect(
      getErrorMessage(new Error("timeout of 60000ms exceeded")),
    ).toBe(
      "La solicitud tardó más de lo esperado en responder. Es posible que la operación se haya completado en el servidor; por favor recarga la página para verificar.",
    );
  });
});

describe("ErrorFactory.NoShippingCoverage", () => {
  it("responde 422 con un código que la tienda reconoce", async () => {
    const response = handleErrorResponse(
      ErrorFactory.NoShippingCoverage(),
      "QUOTE_SHIPPING",
      { expectedStatusCodes: [422] },
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Ninguna transportadora cubre esta dirección por ahora.",
      details: { code: "NO_COVERAGE" },
    });
  });
});
