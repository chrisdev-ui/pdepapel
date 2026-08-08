export type MercadoLibreConfig = {
  clientId: string;
  clientSecret: string;
  oauthRedirectUri: string;
  tokenEncryptionKey: string;
};

export class MercadoLibreConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoLibreConfigurationError";
  }
}

const REQUIRED_ENVIRONMENT_VARIABLES = [
  "MERCADOLIBRE_CLIENT_ID",
  "MERCADOLIBRE_CLIENT_SECRET",
  "MERCADOLIBRE_OAUTH_REDIRECT_URI",
  "MERCADOLIBRE_TOKEN_ENCRYPTION_KEY",
] as const;

type MarketplaceEnvironment = Record<string, string | undefined>;

export function getMercadoLibreConfigurationStatus(
  environment: MarketplaceEnvironment = process.env,
) {
  const missing = REQUIRED_ENVIRONMENT_VARIABLES.filter(
    (key) => !environment[key]?.trim(),
  );

  return {
    configured: missing.length === 0,
    missing,
  };
}

export function getMercadoLibreConfig(
  environment: MarketplaceEnvironment = process.env,
): MercadoLibreConfig {
  const status = getMercadoLibreConfigurationStatus(environment);
  if (!status.configured) {
    throw new MercadoLibreConfigurationError(
      `Faltan variables de configuración de Mercado Libre: ${status.missing.join(", ")}`,
    );
  }

  const oauthRedirectUri = environment.MERCADOLIBRE_OAUTH_REDIRECT_URI!.trim();
  let parsedRedirectUri: URL;
  try {
    parsedRedirectUri = new URL(oauthRedirectUri);
  } catch {
    throw new MercadoLibreConfigurationError(
      "MERCADOLIBRE_OAUTH_REDIRECT_URI debe ser una URL HTTPS válida",
    );
  }

  if (parsedRedirectUri.protocol !== "https:") {
    throw new MercadoLibreConfigurationError(
      "MERCADOLIBRE_OAUTH_REDIRECT_URI debe usar HTTPS",
    );
  }

  return {
    clientId: environment.MERCADOLIBRE_CLIENT_ID!.trim(),
    clientSecret: environment.MERCADOLIBRE_CLIENT_SECRET!.trim(),
    oauthRedirectUri: parsedRedirectUri.toString(),
    tokenEncryptionKey: environment.MERCADOLIBRE_TOKEN_ENCRYPTION_KEY!.trim(),
  };
}
