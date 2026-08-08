import type { MercadoLibreConfig } from "./config";

const AUTHORIZATION_ENDPOINT = "https://auth.mercadolibre.com/authorization";
const TOKEN_ENDPOINT = "https://api.mercadolibre.com/oauth/token";
const API_BASE_URL = "https://api.mercadolibre.com";

type MercadoLibreTokenPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

export type MercadoLibreTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export type MercadoLibreProfile = {
  id: string;
  siteId: string | null;
  nickname: string | null;
};

export class MercadoLibreApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MercadoLibreApiError";
  }
}

async function getResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getApiErrorMessage(body: Record<string, unknown> | null) {
  const message = body?.message ?? body?.error_description ?? body?.error;
  return typeof message === "string"
    ? message
    : "Mercado Libre rechazó la solicitud";
}

export function createMercadoLibreAuthorizationUrl(
  config: MercadoLibreConfig,
  state: string,
) {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.oauthRedirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeMercadoLibreAuthorizationCode(
  config: MercadoLibreConfig,
  code: string,
  request: typeof fetch = fetch,
): Promise<MercadoLibreTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.oauthRedirectUri,
  });
  const response = await request(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = (await getResponseBody(
    response,
  )) as MercadoLibreTokenPayload | null;

  if (!response.ok) {
    throw new MercadoLibreApiError(
      getApiErrorMessage(payload),
      response.status,
    );
  }

  const accessToken = payload?.access_token;
  const refreshToken = payload?.refresh_token;
  const expiresIn = Number(payload?.expires_in);
  if (
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new MercadoLibreApiError(
      "Mercado Libre respondió con credenciales incompletas",
      502,
    );
  }

  return { accessToken, refreshToken, expiresInSeconds: expiresIn };
}

export async function refreshMercadoLibreAccessToken(
  config: MercadoLibreConfig,
  refreshToken: string,
  request: typeof fetch = fetch,
): Promise<MercadoLibreTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });
  const response = await request(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = (await getResponseBody(
    response,
  )) as MercadoLibreTokenPayload | null;

  if (!response.ok) {
    throw new MercadoLibreApiError(
      getApiErrorMessage(payload),
      response.status,
    );
  }

  const accessToken = payload?.access_token;
  const nextRefreshToken = payload?.refresh_token;
  const expiresIn = Number(payload?.expires_in);
  if (
    typeof accessToken !== "string" ||
    typeof nextRefreshToken !== "string" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new MercadoLibreApiError(
      "Mercado Libre respondió con credenciales incompletas",
      502,
    );
  }

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresInSeconds: expiresIn,
  };
}

export async function getMercadoLibreProfile(
  accessToken: string,
  request: typeof fetch = fetch,
): Promise<MercadoLibreProfile> {
  const response = await request(`${API_BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await getResponseBody(response);
  if (!response.ok) {
    throw new MercadoLibreApiError(
      getApiErrorMessage(payload),
      response.status,
    );
  }

  const id = payload?.id;
  if (typeof id !== "string" && typeof id !== "number") {
    throw new MercadoLibreApiError(
      "Mercado Libre no devolvió el identificador del vendedor",
      502,
    );
  }

  return {
    id: String(id),
    siteId: typeof payload?.site_id === "string" ? payload.site_id : null,
    nickname: typeof payload?.nickname === "string" ? payload.nickname : null,
  };
}
