/**
 * Cuánto gastó cada pantalla en la llave compartida de Gemini.
 *
 * La llave es de nivel gratuito y la comparten cuatro pantallas; sin una
 * línea por llamada, los topes diarios y la política de reintentos se
 * ajustan a ciegas. Se lee en los registros de Vercel filtrando `[AI_USAGE]`.
 */
export function logModelUsage(
  surface: string,
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
) {
  console.info("[AI_USAGE]", {
    surface,
    input: usage?.inputTokens ?? null,
    output: usage?.outputTokens ?? null,
  });
}
