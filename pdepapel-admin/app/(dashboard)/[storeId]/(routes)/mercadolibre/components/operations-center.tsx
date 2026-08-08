"use client";

import { MercadoLibreLogo } from "@/components/mercadolibre-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  Send,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type HealthSummary = {
  totalListings: number;
  activeListings: number;
  unansweredQuestions: number;
  shipmentsToDispatch: number;
  claimsRequiringAttention: number;
  grossSales: number;
  netSales: number;
  marketplaceCosts: number;
  netProfit: number;
  issues: {
    kind: string;
    title: string;
    detail: string;
  }[];
};

type Question = {
  id: string;
  status: string;
  question: string;
  answer: string | null;
  askedAt: string | null;
  product: { name: string; description: string } | null;
  suggestedAnswer: string;
};

type Shipment = {
  id: string;
  externalShipmentId: string;
  status: string;
  substatus: string | null;
  trackingNumber: string | null;
  marketplaceOrder: {
    externalOrderId: string;
    buyerName: string | null;
  } | null;
};

type Claim = {
  id: string;
  externalClaimId: string;
  status: string;
  stage: string | null;
  title: string | null;
  dueAt: string | null;
  marketplaceOrder: {
    externalOrderId: string;
    buyerName: string | null;
  } | null;
};

type Profitability = {
  listingId: string | null;
  title: string;
  productName: string | null;
  unitsSold: number;
  netCollected: number;
  productCost: number;
  netProfit: number;
  marginPercentage: number | null;
  lastSaleAt: string | null;
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeZone: "America/Bogota",
});

function getErrorMessage(response: Response) {
  return response
    .json()
    .then(
      (body: { error?: string }) =>
        body.error ?? "No fue posible completar la acción",
    )
    .catch(() => "No fue posible completar la acción");
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "Sin fecha";
}

function getQuestionStatusLabel(status: string) {
  return status === "ANSWERED" ? "Respondida" : "Por responder";
}

export function MercadoLibreOperationsCenter({ storeId }: { storeId: string }) {
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [profitability, setProfitability] = useState<Profitability[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingQuestions, setIsRefreshingQuestions] = useState(false);
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const baseUrl = `/api/${storeId}/marketplaces/mercadolibre`;
      const [
        healthResponse,
        questionsResponse,
        shipmentsResponse,
        claimsResponse,
        profitabilityResponse,
      ] = await Promise.all([
        fetch(`${baseUrl}/health`),
        fetch(`${baseUrl}/questions`),
        fetch(`${baseUrl}/shipments`),
        fetch(`${baseUrl}/claims`),
        fetch(`${baseUrl}/profitability`),
      ]);
      const failedResponse = [
        healthResponse,
        questionsResponse,
        shipmentsResponse,
        claimsResponse,
        profitabilityResponse,
      ].find((response) => !response.ok);
      if (failedResponse)
        throw new Error(await getErrorMessage(failedResponse));

      const [
        nextHealth,
        nextQuestions,
        nextShipments,
        nextClaims,
        nextProfitability,
      ] = (await Promise.all([
        healthResponse.json(),
        questionsResponse.json(),
        shipmentsResponse.json(),
        claimsResponse.json(),
        profitabilityResponse.json(),
      ])) as [HealthSummary, Question[], Shipment[], Claim[], Profitability[]];
      setHealth(nextHealth);
      setQuestions(nextQuestions);
      setShipments(nextShipments);
      setClaims(nextClaims);
      setProfitability(nextProfitability);
      setDrafts((current) =>
        Object.fromEntries(
          nextQuestions.map((question) => [
            question.id,
            current[question.id] ?? question.suggestedAnswer,
          ]),
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible cargar el centro de operaciones",
      );
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshQuestions = async () => {
    setIsRefreshingQuestions(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/questions`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible actualizar las preguntas",
      );
    } finally {
      setIsRefreshingQuestions(false);
    }
  };

  const answerQuestion = async (question: Question) => {
    const text = drafts[question.id]?.trim() ?? "";
    if (!text) {
      setError("Escribe o revisa una respuesta antes de enviarla");
      return;
    }
    if (
      !window.confirm("¿Enviar esta respuesta al cliente en Mercado Libre?")
    ) {
      return;
    }
    setAnsweringQuestionId(question.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/questions/${question.id}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible enviar la respuesta",
      );
    } finally {
      setAnsweringQuestionId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MercadoLibreLogo variant="mark" className="h-6 w-6" />
            Centro de operaciones
          </CardTitle>
          <CardDescription>
            Revisa ventas, preguntas, envíos y reclamos. Las decisiones
            sensibles se toman manualmente.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadData()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Actualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {health ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="Publicaciones activas"
              value={`${health.activeListings} de ${health.totalListings}`}
            />
            <SummaryCard
              icon={<MessageCircleQuestion className="h-4 w-4" />}
              label="Preguntas por responder"
              value={String(health.unansweredQuestions)}
            />
            <SummaryCard
              icon={<Truck className="h-4 w-4" />}
              label="Envíos por despachar"
              value={String(health.shipmentsToDispatch)}
            />
            <SummaryCard
              icon={<ShieldAlert className="h-4 w-4" />}
              label="Reclamos a revisar"
              value={String(health.claimsRequiringAttention)}
            />
          </div>
        ) : null}

        {health?.issues.length ? (
          <div className="rounded-md border border-amber-300 bg-amber-50/60 p-4">
            <p className="flex items-center gap-2 font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" /> Alertas del día
            </p>
            <ul className="mt-2 space-y-2 text-sm text-amber-900">
              {health.issues.map((issue, index) => (
                <li key={`${issue.kind}-${issue.title}-${index}`}>
                  <span className="font-medium">{issue.title}:</span>{" "}
                  {issue.detail}
                </li>
              ))}
            </ul>
          </div>
        ) : health && !isLoading ? (
          <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
            No hay alertas pendientes. Aun así, revisa las ventas antes de
            despachar.
          </p>
        ) : null}

        <section className="space-y-3 rounded-md border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold">
                <MessageCircleQuestion className="h-4 w-4" /> Preguntas de
                compradores
              </p>
              <p className="text-sm text-muted-foreground">
                La sugerencia es un borrador: revísala y ajusta antes de
                enviarla.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshQuestions()}
              disabled={isRefreshingQuestions}
            >
              {isRefreshingQuestions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Actualizar preguntas
            </Button>
          </div>
          {questions.filter((question) => question.status !== "ANSWERED")
            .length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay preguntas pendientes.
            </p>
          ) : (
            <div className="grid gap-3">
              {questions
                .filter((question) => question.status !== "ANSWERED")
                .map((question) => (
                  <div key={question.id} className="rounded-md bg-muted/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {question.product?.name ??
                          "Publicación sin producto vinculado"}
                      </p>
                      <Badge variant="secondary">
                        {getQuestionStatusLabel(question.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(question.askedAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{question.question}</p>
                    <Textarea
                      className="mt-3 min-h-24"
                      value={drafts[question.id] ?? ""}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDrafts((current) => ({
                            ...current,
                            [question.id]: question.suggestedAnswer,
                          }))
                        }
                      >
                        Usar sugerencia
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void answerQuestion(question)}
                        disabled={answeringQuestionId === question.id}
                      >
                        {answeringQuestionId === question.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Enviar respuesta
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <OperationsList
            title="Envíos y despachos"
            icon={<Truck className="h-4 w-4" />}
            empty="No hay envíos recibidos todavía."
          >
            {shipments.slice(0, 10).map((shipment) => (
              <div
                key={shipment.id}
                className="rounded-md bg-muted/40 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    Envío {shipment.externalShipmentId}
                  </span>
                  <Badge variant="secondary">{shipment.status}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Pedido{" "}
                  {shipment.marketplaceOrder?.externalOrderId ?? "sin vincular"}
                  {shipment.trackingNumber
                    ? ` · Guía ${shipment.trackingNumber}`
                    : ""}
                </p>
              </div>
            ))}
          </OperationsList>
          <OperationsList
            title="Reclamos"
            icon={<ShieldAlert className="h-4 w-4" />}
            empty="No hay reclamos recibidos todavía."
          >
            {claims.slice(0, 10).map((claim) => (
              <div
                key={claim.id}
                className="rounded-md bg-muted/40 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {claim.title ?? `Reclamo ${claim.externalClaimId}`}
                  </span>
                  <Badge variant="destructive">{claim.status}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Pedido{" "}
                  {claim.marketplaceOrder?.externalOrderId ?? "sin vincular"} ·
                  Fecha límite {formatDate(claim.dueAt)}
                </p>
              </div>
            ))}
          </OperationsList>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <BarChart3 className="h-4 w-4" /> Ganancia real por publicación
            </p>
            <p className="text-sm text-muted-foreground">
              El valor neto es lo que Mercado Libre reportó que recibiste; se
              descuenta el costo de adquisición registrado en P de Papel.
            </p>
          </div>
          {profitability.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aparecerá al existir ventas pagadas con liquidación de Mercado
              Libre.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-4">Publicación</th>
                    <th className="pb-2 pr-4">Unidades</th>
                    <th className="pb-2 pr-4">Neto recibido</th>
                    <th className="pb-2 pr-4">Costo producto</th>
                    <th className="pb-2 pr-4">Ganancia</th>
                    <th className="pb-2">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {profitability.slice(0, 20).map((item) => (
                    <tr
                      key={item.listingId ?? item.title}
                      className="border-b last:border-0"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium">{item.title}</p>
                        {item.productName ? (
                          <p className="text-xs text-muted-foreground">
                            {item.productName}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">{item.unitsSold}</td>
                      <td className="py-3 pr-4">
                        {currencyFormatter.format(item.netCollected)}
                      </td>
                      <td className="py-3 pr-4">
                        {currencyFormatter.format(item.productCost)}
                      </td>
                      <td
                        className={`py-3 pr-4 font-medium ${item.netProfit < 0 ? "text-destructive" : "text-success"}`}
                      >
                        {currencyFormatter.format(item.netProfit)}
                      </td>
                      <td className="py-3">
                        {item.marginPercentage === null
                          ? "—"
                          : `${item.marginPercentage.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function OperationsList({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon: ReactNode;
  empty: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div className="space-y-3 rounded-md border p-4">
      <p className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </p>
      {hasChildren ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
