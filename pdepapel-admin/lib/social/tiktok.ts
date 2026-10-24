import { createHash } from "node:crypto";

import { SocialPlatform } from "@prisma/client";

import type { TikTokConfig } from "./config";
import type { TikTokTokenSet } from "./credentials";
import { SocialApiError } from "./errors";
import { knownDuration, pickMetrics, TIKTOK_POST_METRICS } from "./metrics";
import type { SocialAdapter } from "./sync";

/**
 * TikTok Login Kit (web) y Display API v2, solo lectura de nuestra cuenta.
 * Alcances: user.info.basic, user.info.stats y video.list (sin user.info.profile,
 * así que el nombre es `display_name`, no `username`).
 */
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";
const TIMEOUT_MS = 15_000;
export const TIKTOK_SCOPES = ["user.info.basic", "user.info.stats", "video.list"] as const;

/**
 * La documentación web de Login Kit no menciona PKCE (solo móvil y escritorio,
 * con el reto en hexadecimal). Queda listo y apagado: si la prueba en Sandbox
 * lo acepta, se enciende aquí. El state de un solo uso protege igual contra CSRF.
 */
export const TIKTOK_USE_PKCE = false;

type FetchImpl = typeof fetch;

/** Reto S256 como lo pide TikTok: SHA-256 en hexadecimal, no base64url. */
export function tiktokCodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("hex");
}

export function buildTikTokAuthorizeUrl(config: Pick<TikTokConfig, "clientKey" | "redirectUri">, state: string, codeVerifier: string, usePkce = TIKTOK_USE_PKCE) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_key", config.clientKey);
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  if (usePkce) {
    url.searchParams.set("code_challenge", tiktokCodeChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

function apiError(status: number, code: string | null, retryAfter: string | null) {
  if (status === 429 || code === "rate_limit_exceeded") {
    const seconds = Number(retryAfter);
    return new SocialApiError(SocialPlatform.TIKTOK, "rate_limit", "tiktok_rate_limit", status, Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
  }
  if (status === 401 || code === "access_token_invalid" || code === "scope_not_authorized" || code === "invalid_grant") {
    return new SocialApiError(SocialPlatform.TIKTOK, "auth", `tiktok_${code ?? "unauthorized"}`, status);
  }
  return new SocialApiError(SocialPlatform.TIKTOK, "http", code ? `tiktok_${code}`.slice(0, 60) : `http_${status}`, status);
}

async function send(fetchImpl: FetchImpl, url: string, init: RequestInit) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new SocialApiError(SocialPlatform.TIKTOK, "http", "network", null);
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope?: string;
  error?: string;
}

async function tokenRequest(config: Pick<TikTokConfig, "clientKey" | "clientSecret">, params: Record<string, string>, fetchImpl: FetchImpl): Promise<TikTokTokenSet> {
  const response = await send(fetchImpl, `${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.clientSecret, ...params }),
  });
  const body = (await response.json().catch(() => null)) as TokenResponse | null;
  if (!response.ok || !body || body.error || !body.access_token || !body.refresh_token || !body.open_id) {
    throw apiError(response.status, body?.error ?? null, response.headers.get("retry-after"));
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in ?? 86_400,
    refreshExpiresIn: body.refresh_expires_in ?? 31_536_000,
    scope: body.scope ?? null,
    openId: body.open_id,
  };
}

export function exchangeTikTokCode(config: TikTokConfig, code: string, codeVerifier: string, fetchImpl: FetchImpl = fetch, usePkce = TIKTOK_USE_PKCE) {
  return tokenRequest(
    config,
    { code, grant_type: "authorization_code", redirect_uri: config.redirectUri, ...(usePkce ? { code_verifier: codeVerifier } : {}) },
    fetchImpl,
  );
}

export function refreshTikTokTokens(config: Pick<TikTokConfig, "clientKey" | "clientSecret">, refreshToken: string, fetchImpl: FetchImpl = fetch) {
  return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

export async function revokeTikTokToken(config: Pick<TikTokConfig, "clientKey" | "clientSecret">, token: string, fetchImpl: FetchImpl = fetch) {
  const response = await send(fetchImpl, `${API}/oauth/revoke/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.clientSecret, token }),
  });
  return response.ok;
}

interface DisplayResponse<T> {
  data?: T;
  error?: { code?: string };
}

async function displayRequest<T>(fetchImpl: FetchImpl, accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(fetchImpl, `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as DisplayResponse<T> | null;
  const code = body?.error?.code ?? null;
  if (!response.ok || (code && code !== "ok") || !body?.data) throw apiError(response.status, code, response.headers.get("retry-after"));
  return body.data;
}

const USER_FIELDS = "open_id,display_name,follower_count,following_count,likes_count,video_count";
const VIDEO_FIELDS = "id,create_time,cover_image_url,share_url,video_description,duration,title,like_count,comment_count,share_count,view_count";

interface TikTokVideo {
  id: string;
  create_time: number;
  cover_image_url?: string;
  share_url?: string;
  video_description?: string;
  title?: string;
  duration?: number;
  [metric: string]: unknown;
}

export function createTikTokAdapter(options: { getAccessToken: () => Promise<string>; fetchImpl?: FetchImpl }): SocialAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    platform: SocialPlatform.TIKTOK,
    async fetchAccount() {
      const data = await displayRequest<{ user: Record<string, unknown> & { open_id: string; display_name?: string } }>(
        fetchImpl,
        await options.getAccessToken(),
        `/user/info/?fields=${USER_FIELDS}`,
      );
      return { externalId: data.user.open_id, username: data.user.display_name ?? null, metrics: data.user };
    },
    async listPosts(cursor) {
      const data = await displayRequest<{ videos?: TikTokVideo[]; cursor?: number; has_more?: boolean }>(fetchImpl, await options.getAccessToken(), `/video/list/?fields=${VIDEO_FIELDS}`, {
        method: "POST",
        body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor: Number(cursor) } : {}) }),
      });
      return {
        posts: (data.videos ?? []).map((video) => {
          // La Display API no dice si es foto: las publicaciones de fotos llegan con duración 0 (comprobado contra la página pública).
          const photo = video.duration === 0;
          return {
            externalId: video.id,
            mediaType: photo ? "PHOTO" : "VIDEO",
            productType: photo ? ("CAROUSEL" as const) : ("VIDEO" as const),
            caption: video.title || video.video_description || null,
            permalink: video.share_url ?? null,
            thumbnailUrl: video.cover_image_url ?? null,
            durationSec: knownDuration(video.duration),
            postedAt: new Date(video.create_time * 1000),
            metrics: pickMetrics(video, TIKTOK_POST_METRICS),
          };
        }),
        next: data.has_more && data.cursor ? String(data.cursor) : null,
      };
    },
  };
}
