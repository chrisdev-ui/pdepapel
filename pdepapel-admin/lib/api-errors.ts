import { GENERIC_ERROR } from "@/constants";
import { Prisma } from "@prisma/client";
import axios from "axios";
import { NextResponse } from "next/server";

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
    items: { productName: string; available: number; requested: number }[],
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
};

export type ErrorHandlerOptions = {
  headers?: Record<string, string>;
};

export const handleErrorResponse = (
  error: unknown,
  context?: string,
  options: ErrorHandlerOptions = {},
) => {
  // Log the error context and error details to the console
  console.error(`Error in [${context}]:`, error);

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
        default:
          return new AppError("Error en la base de datos", 500, {
            code: error.code,
          });
      }
    })();

    return NextResponse.json(
      { error: prismaError.message, details: prismaError.details },
      { status: prismaError.statusCode, headers: options.headers },
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
    errorMessage = error.response?.data?.error ?? error.message;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }
  return errorMessage;
};
