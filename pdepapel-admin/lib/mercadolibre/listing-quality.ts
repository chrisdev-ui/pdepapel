type PerformanceRule = {
  key: string | null;
  link: string | null;
  title: string;
  label: string | null;
  mode: "OPPORTUNITY" | "WARNING" | null;
  isVideoRecommendation: boolean;
};

export type MercadoLibreListingQuality = {
  score: number | null;
  level: string | null;
  levelWording: string | null;
  pendingRules: PerformanceRule[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getMercadoLibreLink(value: unknown) {
  const link = getString(value);
  if (!link) return null;

  try {
    const url = new URL(link, "https://www.mercadolibre.com.co");
    const isMercadoLibreHost =
      /^([a-z0-9-]+\.)*mercadolibre\.com(\.[a-z]{2})?$/i.test(url.hostname);

    return url.protocol === "https:" && isMercadoLibreHost
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isVideoRecommendation(values: Array<string | null | undefined>) {
  return values.some((value) => {
    if (!value) return false;

    return /\b(video|vídeo|clip)\b/i.test(value);
  });
}

export function parseMercadoLibreListingQuality(
  payload: unknown,
): MercadoLibreListingQuality {
  const data = asRecord(payload);
  const rules: PerformanceRule[] = [];
  const buckets = Array.isArray(data?.buckets) ? data.buckets : [];

  for (const bucket of buckets) {
    const bucketData = asRecord(bucket);
    const variables = Array.isArray(bucketData?.variables)
      ? bucketData.variables
      : [];
    for (const variable of variables) {
      const variableData = asRecord(variable);
      const variableRules = Array.isArray(variableData?.rules)
        ? variableData.rules
        : [];
      for (const rule of variableRules) {
        const ruleData = asRecord(rule);
        if (getString(ruleData?.status) === "COMPLETED") continue;
        const wordings = asRecord(ruleData?.wordings);
        const title =
          getString(wordings?.title) ?? getString(variableData?.title);
        if (!title) continue;
        const key = getString(ruleData?.key);
        const label = getString(wordings?.label);
        rules.push({
          key,
          link: getMercadoLibreLink(wordings?.link),
          title,
          label,
          mode:
            getString(ruleData?.mode) === "OPPORTUNITY" ||
            getString(ruleData?.mode) === "WARNING"
              ? (getString(ruleData?.mode) as "OPPORTUNITY" | "WARNING")
              : null,
          isVideoRecommendation: isVideoRecommendation([
            key,
            getString(variableData?.key),
            getString(variableData?.title),
            title,
            label,
          ]),
        });
      }
    }
  }

  return {
    score: typeof data?.score === "number" ? data.score : null,
    level: getString(data?.level),
    levelWording: getString(data?.level_wording),
    pendingRules: rules.slice(0, 12),
  };
}
