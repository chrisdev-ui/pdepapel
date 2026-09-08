import { Banknote, CreditCard, Landmark, ShieldCheck } from "lucide-react";

import { CONFIGURED, MISSING, OPTIONAL_OFF, StatusCard } from "./status-cards";

/**
 * Pestaña Pagos: qué proveedor cobra en línea y cómo se confirma cada método.
 * Solo lee si las variables existen; nunca muestra su valor. Los cambios se
 * hacen en Vercel, no aquí.
 */
export function PaymentsPanel({ storeId }: { storeId: string }) {
  const bold = Boolean(process.env.BOLD_SECRET_KEY);
  const boldTerminal = Boolean(process.env.BOLD_DATAFONO_IDENTITY_KEY && process.env.BOLD_DATAFONO_SECRET_KEY);
  const wompi = Boolean(process.env.WOMPI_API_KEY && process.env.WOMPI_INTEGRITY_KEY && process.env.WOMPI_EVENTS_KEY);
  const environment = process.env.BOLD_ENVIRONMENT || "production";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        La tienda muestra «Pago en línea» sin nombrar al proveedor. Bold cobra por defecto, Wompi entra como respaldo y la transferencia se confirma a mano en cada pedido. Las claves viven en Vercel; aquí solo se ve si existen.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <StatusCard
          icon={CreditCard}
          title="Bold · pago en línea"
          description="Proveedor principal de tarjetas, PSE y Nequi en la tienda en línea. El pago se confirma por webhook, nunca por el regreso del cliente."
          status={bold ? CONFIGURED : MISSING}
          facts={[
            { label: "Ambiente", value: environment },
            { label: "Datáfono Bold", value: boldTerminal ? "Vinculado" : "No vinculado" },
          ]}
        />
        <StatusCard
          icon={ShieldCheck}
          title="Wompi · respaldo"
          description="Se usa solo si Bold no está disponible. También confirma por webhook firmado."
          status={wompi ? CONFIGURED : OPTIONAL_OFF}
        />
        <StatusCard
          icon={Landmark}
          title="Transferencia bancaria"
          description="El pedido queda pendiente hasta que confirmes el pago en su página. Pedidos › Por verificar reúne los que esperan."
          status={{ label: "Manual", tone: "sky" }}
          action={{ label: "Ver transferencias por verificar", href: `/${storeId}/pedidos?vista=por-verificar` }}
        />
        <StatusCard
          icon={Banknote}
          title="Efectivo y contra entrega"
          description="El punto de venta y las ferias cobran en efectivo o transferencia y quedan pagados al confirmar. Contra entrega se marca pagado al entregar."
          status={{ label: "Siempre disponible", tone: "lavender" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">PayU sigue instalado solo por pedidos antiguos; no se ofrece a clientes nuevos.</p>
    </div>
  );
}
