/**
 * Memoria del contenedor de MySQL según Railway (la misma fuente que el
 * gráfico y `railway metrics`). MySQL solo cuenta lo que reserva; lo que el
 * sistema no recupera solo se ve aquí. El token es de proyecto y nunca sale
 * en un registro ni en el detalle.
 */

export const RAILWAY_GRAPHQL_URL = "https://backboard.railway.com/graphql/v2";
export const MYSQL_SERVICE_NAME = "MySQL US East";
const LOOKBACK_HOURS = 25;
const SAMPLE_SECONDS = 300;
const DAY_AGO_TOLERANCE_SECONDS = 30 * 60;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type ContainerMemoryReading =
  | { ok: true; currentGb: number; limitGb: number | null; dayAgoGb: number | null; growthGb: number | null; at: Date }
  | { ok: false; reason: string };

const failure = (detail: string): ContainerMemoryReading => ({ ok: false, reason: `sin lectura de Railway (${detail})` });

async function railway<T>(fetch: Fetch, token: string, query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(RAILWAY_GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "Project-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; errors?: { message?: string }[] };
  if (!response.ok || body.errors?.length || !body.data) {
    const message = body.errors?.[0]?.message ?? `HTTP ${response.status}`;
    throw new Error(message.split(token).join("…"));
  }
  return body.data;
}

export async function readMysqlContainerMemory({
  token = process.env.RAILWAY_METRICS_TOKEN,
  fetch = globalThis.fetch as Fetch,
  now = new Date(),
}: { token?: string; fetch?: Fetch; now?: Date } = {}): Promise<ContainerMemoryReading> {
  if (!token?.trim()) return failure("falta RAILWAY_METRICS_TOKEN");
  try {
    const { projectToken } = await railway<{
      projectToken: { projectId: string; environmentId: string; project: { services: { edges: { node: { id: string; name: string } }[] } } };
    }>(fetch, token, "query { projectToken { projectId environmentId project { services { edges { node { id name } } } } } }");
    const service = projectToken.project.services.edges.find((edge) => edge.node.name === MYSQL_SERVICE_NAME);
    if (!service) return failure(`no aparece el servicio «${MYSQL_SERVICE_NAME}»`);

    const { metrics } = await railway<{ metrics: { measurement: string; values: { ts: number; value: number }[] }[] }>(
      fetch,
      token,
      "query($projectId: String!, $environmentId: String!, $serviceId: String!, $startDate: DateTime!, $sampleRateSeconds: Int!) { metrics(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, startDate: $startDate, sampleRateSeconds: $sampleRateSeconds, measurements: [MEMORY_USAGE_GB, MEMORY_LIMIT_GB]) { measurement values { ts value } } }",
      {
        projectId: projectToken.projectId,
        environmentId: projectToken.environmentId,
        serviceId: service.node.id,
        startDate: new Date(now.getTime() - LOOKBACK_HOURS * 3600 * 1000).toISOString(),
        sampleRateSeconds: SAMPLE_SECONDS,
      },
    );
    const usage = metrics.find((metric) => metric.measurement === "MEMORY_USAGE_GB")?.values ?? [];
    const limit = metrics.find((metric) => metric.measurement === "MEMORY_LIMIT_GB")?.values ?? [];
    const latest = usage.at(-1);
    if (!latest) return failure("Railway no devolvió datos de memoria");

    const dayAgoTs = latest.ts - 24 * 3600;
    const dayAgo = usage
      .filter((point) => Math.abs(point.ts - dayAgoTs) <= DAY_AGO_TOLERANCE_SECONDS)
      .sort((a, b) => Math.abs(a.ts - dayAgoTs) - Math.abs(b.ts - dayAgoTs))[0];
    return {
      ok: true,
      currentGb: latest.value,
      limitGb: limit.at(-1)?.value ?? null,
      dayAgoGb: dayAgo?.value ?? null,
      growthGb: dayAgo ? latest.value - dayAgo.value : null,
      at: new Date(latest.ts * 1000),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(message.split(token).join("…").slice(0, 160));
  }
}
