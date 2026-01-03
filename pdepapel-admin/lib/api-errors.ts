import { GENERIC_ERROR } from "@/constants";
import axios from "axios";

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

export const getErrorMessage = (error: unknown): string => {
  let errorMessage = GENERIC_ERROR;
  if (axios.isAxiosError(error)) {
    errorMessage = error.response?.data?.error ?? error.message;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }
  return errorMessage;
};
