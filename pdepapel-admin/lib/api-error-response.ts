import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { AppError, ErrorHandlerOptions } from "./api-errors";

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
