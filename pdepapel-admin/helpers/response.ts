import { NextResponse } from "next/server";

/**
 * Handles the error response by creating a NextResponse object with the specified error message and status code.
 * @param message - The error message to be included in the response.
 * @param status - The HTTP status code for the response.
 * @returns A NextResponse object with the error message and status code.
 */
export function handleErrorResponse(
  message: string,
  status: number,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json({ error: message }, { status, headers });
}

/**
 * Handles a successful response by returning a NextResponse object with the specified message and status.
 * @param message - The message to be included in the response.
 * @param status - The HTTP status code for the response. Defaults to 200 if not provided.
 * @returns A NextResponse object containing the message and status.
 */
export function handleSuccessResponse(
  message?: string | any,
  status: number = 200,
  headers?: HeadersInit,
): NextResponse {
  const response = typeof message === "string" ? { message } : message;
  return NextResponse.json(response, { status, headers });
}
