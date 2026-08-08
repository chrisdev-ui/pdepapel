type PerformanceRule = {
  title: string;
  label: string | null;
  mode: "OPPORTUNITY" | "WARNING" | null;
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
        rules.push({
          title,
          label: getString(wordings?.label),
          mode:
            getString(ruleData?.mode) === "OPPORTUNITY" ||
            getString(ruleData?.mode) === "WARNING"
              ? (getString(ruleData?.mode) as "OPPORTUNITY" | "WARNING")
              : null,
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
