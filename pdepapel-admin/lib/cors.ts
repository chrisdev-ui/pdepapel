type CorsOptions = {
  methods: string;
  headers?: string;
  maxAge?: string;
};

const PRODUCTION_ORIGINS = new Set([
  "https://papeleriapdepapel.com",
  "https://admin.papeleriapdepapel.com",
]);

const LOCAL_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3100",
  "http://localhost:3101",
]);

export function isAllowedCorsOrigin(origin: string | null): origin is string {
  if (!origin) return false;

  return (
    PRODUCTION_ORIGINS.has(origin) ||
    (process.env.NODE_ENV !== "production" && LOCAL_ORIGINS.has(origin))
  );
}

export function createCorsHeaders(
  request: Request,
  { methods, headers = "Content-Type, Authorization", maxAge = "86400" }: CorsOptions,
): Record<string, string> {
  const origin = request.headers.get("origin");
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": headers,
    "Access-Control-Max-Age": maxAge,
    Vary: "Origin",
  };

  if (isAllowedCorsOrigin(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
  }

  return corsHeaders;
}
