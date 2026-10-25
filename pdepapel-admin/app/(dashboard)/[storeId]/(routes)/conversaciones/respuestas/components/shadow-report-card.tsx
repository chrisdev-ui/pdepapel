import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SHADOW_REPORT_DAYS, type ShadowReport } from "@/lib/whatsapp/shadow/report";

const INTENT_LABELS: Record<string, string> = {
  greeting: "Saludo",
  acknowledgement: "«Ok», «listo»",
  thanks: "Gracias",
  goodbye: "Despedida",
  bot_identity: "«¿Eres un robot?»",
  catalog_question: "«¿Qué venden?»",
  product: "Productos",
  fact: "Datos del negocio",
  escalate: "Queja o problema",
  other: "Otra cosa",
  web_product: "Desde un producto de la tienda",
  web_cart: "Desde el carrito de la tienda",
  web_order: "Desde un pedido de la tienda",
  web_general: "Desde la tienda (sin producto)",
  order_request: "«Sí» a un pedido",
  order_append: "Algo más para el pedido",
  shipping_quote: "Pregunta por el envío",
};

const SILENCE_LABELS: Record<string, string> = {
  bot_disabled: "Bot apagado",
  owner_active: "Paula en la conversación",
  pending_owner: "Paula ya escribió",
  superseded: "La clienta siguió escribiendo",
  needs_owner: "Esperando a Paula",
  welcome_repeat: "Bienvenida ya enviada",
  acknowledgement: "No pedía respuesta",
  cap_per_window: "Tope de mensajes",
};

const number = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });

/** Qué habría hecho el bot nuevo frente al real. Solo lectura; el bot real no cambia. */
export function ShadowReportCard({ data }: { data: ShadowReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bot en modo sombra</CardTitle>
        <CardDescription>
          Últimos {SHADOW_REPORT_DAYS} días. Por cada mensaje escrito, el bot nuevo decide en silencio qué habría
          contestado; a las clientas solo les llega la respuesta del bot de siempre.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {data.evaluated === 0 ? (
          <p className="text-muted-foreground">Todavía no hay mensajes evaluados.</p>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-muted/60 p-3">
                <dt className="text-muted-foreground">Mensajes evaluados</dt>
                <dd className="text-lg font-semibold">{number(data.evaluated)}</dd>
              </div>
              <div className="rounded-md bg-muted/60 p-3">
                <dt className="text-muted-foreground">Bot real: mensajes por mensaje</dt>
                <dd className="text-lg font-semibold">{number(data.realPerInbound)}</dd>
              </div>
              <div className="rounded-md bg-muted/60 p-3">
                <dt className="text-muted-foreground">Bot nuevo: mensajes por mensaje</dt>
                <dd className="text-lg font-semibold">{number(data.shadowPerInbound)}</dd>
              </div>
            </dl>
            <p>
              El bot real dijo «Esa no me la sé» {number(data.realNoMatch)}{" "}
              {data.realNoMatch === 1 ? "vez" : "veces"}; en {number(data.realNoMatchShadowFound)} el bot nuevo habría
              encontrado productos en existencia.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-1 font-medium">De qué iban los mensajes</h3>
                <ul className="space-y-1">
                  {data.intents.map((row) => (
                    <li key={row.intent} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{INTENT_LABELS[row.intent] ?? row.intent}</span>
                      <span className="font-medium tabular-nums">{number(row.count)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {data.silences.length > 0 && (
                <div>
                  <h3 className="mb-1 font-medium">Cuándo el bot nuevo se habría callado</h3>
                  <ul className="space-y-1">
                    {data.silences.map((row) => (
                      <li key={row.reason} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">{SILENCE_LABELS[row.reason] ?? row.reason}</span>
                        <span className="font-medium tabular-nums">{number(row.count)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {data.classifierFailures > 0 && (
              <p className="text-xs text-muted-foreground">
                En {number(data.classifierFailures)} {data.classifierFailures === 1 ? "mensaje" : "mensajes"} la IA no respondió a
                tiempo y no se pudo clasificar.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
