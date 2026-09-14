import { GENERIC_ERROR } from "@/constants";
import { Prisma } from "@prisma/client";
import axios from "axios";
import { NextResponse } from "next/server";
import { ZodError, type ZodIssue } from "zod";

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export const ErrorFactory = {
  InvalidRequest: (
    message: string = "Solicitud inválida",
    details?: Record<string, unknown>,
  ) => new AppError(message, 400, details),

  MissingStoreId: () => new AppError("Se requiere el ID de la tienda", 400),

  Unauthenticated: () => new AppError("Autenticación requerida", 401),

  Unauthorized: () => new AppError("No tienes permisos para esta acción", 403),

  NotFound: (message: string) => new AppError(message, 404),

  Conflict: (
    message: string = "Conflicto en los datos",
    details?: Record<string, unknown>,
  ) => new AppError(message, 409, details),

  TooManyRequests: () =>
    new AppError(
      "Demasiadas solicitudes. Por favor intenta nuevamente más tarde",
      429,
    ),

  // Errores de negocio
  InsufficientStock: (
    productName: string,
    available: number,
    requested: number,
  ) =>
    new AppError(
      `El producto ${productName} no tiene suficiente stock. Disponible: ${available}, Solicitado: ${requested}`,
      422,
      { productName, available, requested },
    ),

  MultipleInsufficientStock: (
    items: {
      productId: string;
      productName: string;
      available: number;
      requested: number;
    }[],
  ) =>
    new AppError(
      `Stock insuficiente para múltiples productos:\n${items
        .map(
          (i) =>
            `- ${i.productName} (Disponible: ${i.available}, Requerido: ${i.requested})`,
        )
        .join("\n")}`,
      422,
      { items },
    ),

  OrderLimit: () =>
    new AppError(
      "Demasiadas órdenes recientes. Por favor espere unos minutos antes de realizar otro pedido.",
      429,
    ),

  CloudinaryError: (error: any, message?: string) =>
    new AppError(error.message ?? message, error.status || 500, error),

  // Error genérico
  InternalServerError: (error?: any) =>
    new AppError("Error interno del servidor", 500, error),
  /** The carriers do not serve the destination: the store shows its own way out. */
  NoShippingCoverage: () =>
    new AppError(
      "Ninguna transportadora cubre esta dirección por ahora.",
      422,
      { code: "NO_COVERAGE" },
    ),
};

/**
 * Un fallo de validación de zod es culpa de quien llama, no del servidor.
 *
 * Sin esto, cualquier ruta que valide con `.parse()` terminaba en el 500
 * genérico: quien usa el panel leía «Error interno del servidor» por haber
 * escrito mal una fecha. Se descubrió con las preventas, pero afectaba a todas.
 *
 * La forma de la respuesta es la misma que ya usaban las rutas con
 * `safeParse`: el mensaje del PRIMER problema —que es el que se muestra— y el
 * resto por campo en `details.fieldErrors`, para quien quiera pintarlos junto
 * a cada casilla.
 */
function zodIssueMessage(issue: ZodIssue | undefined): string {
  if (!issue) return "Los datos enviados no son válidos";

  const campo = issue.path
    .filter((parte) => typeof parte === "string" || typeof parte === "number")
    .join(".");

  const mensaje = issue.message?.trim();

  // Un campo ausente trae el «Required» en inglés de zod cuando el esquema no
  // definió `required_error`. Solo se traduce en ese caso: si el esquema sí
  // escribió su mensaje, manda el suyo — pisarlo cambiaría textos que ya
  // están en producción y probados.
  const esDefaultDeZod = !mensaje || mensaje === "Required";
  if (
    issue.code === "invalid_type" &&
    issue.received === "undefined" &&
    esDefaultDeZod
  ) {
    return campo ? `Falta el campo «${campo}»` : "Faltan datos obligatorios";
  }

  if (!mensaje) {
    return campo
      ? `El campo «${campo}» no es válido`
      : "Los datos enviados no son válidos";
  }
  return mensaje;
}

/** Convierte un ZodError en el 400 que ya devuelven las rutas con `safeParse`. */
export function zodErrorToAppError(error: ZodError): AppError {
  return new AppError(zodIssueMessage(error.issues[0]), 400, {
    fieldErrors: error.flatten().fieldErrors,
  });
}

export type ErrorHandlerOptions = {
  headers?: Record<string, string>;
  expectedStatusCodes?: readonly number[];
  logMetadata?: Record<string, string | number | boolean | null>;
};

export const handleErrorResponse = (
  rawError: unknown,
  context?: string,
  options: ErrorHandlerOptions = {},
) => {
  // Se normaliza primero: así el 400 de validación pasa por el mismo camino
  // (y el mismo criterio de log) que cualquier otro error de negocio.
  const error =
    rawError instanceof ZodError ? zodErrorToAppError(rawError) : rawError;

  const isExpectedAppError =
    error instanceof AppError &&
    options.expectedStatusCodes?.includes(error.statusCode);

  if (isExpectedAppError) {
    console.info(`Expected response in [${context}]:`, {
      statusCode: error.statusCode,
      message: error.message,
      ...options.logMetadata,
    });
  } else {
    console.error(`Error in [${context}]:`, error);
  }

  // Handle Prisma Known Request Errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaError = (() => {
      switch (error.code) {
        case "P2002":
          return new AppError("Ya existe un registro con estos datos", 409, {
            field: error.meta?.target,
          });
        case "P2003":
          return new AppError("El registro relacionado no existe", 400, {
            field: error.meta?.field_name,
          });
        case "P2025":
          return new AppError("El registro no fue encontrado", 404);
        case "P2014":
          return new AppError(
            "La operación violaría una relación requerida",
            400,
          );
        case "P2016":
          return new AppError("Error en la consulta", 400);
        case "P2024":
          // El pool de la instancia no consiguió conexión a tiempo: la base
          // de datos está saturada, no rota. 503 con Retry-After para que el
          // cliente reintente en vez de leerlo como un fallo del servidor.
          return new AppError(
            "La base de datos está ocupada en este momento. Intenta de nuevo en unos segundos.",
            503,
            { code: error.code, retryAfterSeconds: 2 },
          );
        case "P2034":
          // Con Serializable, dos escrituras a la vez sobre la misma fila
          // abortan una: es reintentable, no un fallo del servidor.
          return new AppError(
            "Otra operación tocó los mismos datos al mismo tiempo. Intenta de nuevo.",
            409,
            { code: error.code, retryAfterSeconds: 1 },
          );
        case "P1001":
        case "P1002":
        case "P1008":
        case "P1017":
          // La base de datos no responde o cerró la conexión (reinicio en
          // Railway, red): Prisma reconecta en la siguiente consulta.
          return new AppError(
            "No se pudo conectar con la base de datos. Intenta de nuevo en unos segundos.",
            503,
            { code: error.code, retryAfterSeconds: 5 },
          );
        default:
          return new AppError("Error en la base de datos", 500, {
            code: error.code,
          });
      }
    })();

    const retryAfterSeconds =
      (prismaError.details as { retryAfterSeconds?: number } | undefined)
        ?.retryAfterSeconds ?? (prismaError.statusCode === 503 ? 2 : null);

    return NextResponse.json(
      { error: prismaError.message, details: prismaError.details },
      {
        status: prismaError.statusCode,
        headers: retryAfterSeconds
          ? { ...options.headers, "Retry-After": String(retryAfterSeconds) }
          : options.headers,
      },
    );
  }

  // La base de datos no responde (reinicio, red): tampoco es un 500 del código.
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json(
      {
        error:
          "No se pudo conectar con la base de datos. Intenta de nuevo en unos segundos.",
      },
      { status: 503, headers: { ...options.headers, "Retry-After": "5" } },
    );
  }

  // Handle Prisma Validation Errors (e.g. Invalid Enum Value)
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error("Prisma Validation Error:", error.message);
    // In development/admin, we want to see the real error
    return NextResponse.json(
      {
        error: "Error de validación de base de datos",
        details: { message: error.message },
      },
      { status: 400, headers: options.headers },
    );
  }

  // Handle AppError instances
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, details: error.details },
      { status: error.statusCode, headers: options.headers },
    );
  }

  // Handle general errors
  return NextResponse.json(
    { error: "Error interno del servidor" },
    { status: 500, headers: options.headers },
  );
};

export const getErrorMessage = (error: unknown): string => {
  let errorMessage = GENERIC_ERROR;
  if (axios.isAxiosError(error)) {
    if (
      error.code === "ECONNABORTED" ||
      error.message?.toLowerCase().includes("timeout")
    ) {
      return "La solicitud tardó más de lo esperado en responder. Es posible que la operación se haya completado en el servidor; por favor recarga la página para verificar.";
    }
    if (error.code === "ERR_NETWORK") {
      return "Error de conexión con el servidor. Por favor verifica tu conexión a internet.";
    }
    errorMessage = error.response?.data?.error ?? error.message;
    // Append details if available (e.g. from Prisma Validation)
    if (error.response?.data?.details?.message) {
      errorMessage += `: ${error.response?.data?.details?.message}`;
    }
  } else if (error instanceof Error) {
    if (error.message?.toLowerCase().includes("timeout")) {
      return "La solicitud tardó más de lo esperado en responder. Es posible que la operación se haya completado en el servidor; por favor recarga la página para verificar.";
    }
    errorMessage = error.message;
  }
  return errorMessage;
};
