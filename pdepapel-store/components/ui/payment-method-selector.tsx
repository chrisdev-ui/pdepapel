/* eslint-disable @next/next/no-img-element */
import { Icons } from "@/components/icons";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PaymentMethod } from "@/constants";
import { cn } from "@/lib/utils";
import {
  Check,
  CreditCard,
  HandCoins,
  Info,
  Landmark,
  LucideProps,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

interface PaymentMethodBadge {
  name: string;
  icon?: (props: LucideProps) => JSX.Element;
  image?: string;
}

interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
  summary: string;
  icon: (props: LucideProps) => JSX.Element;
  badges?: PaymentMethodBadge[];
  /** Shown inside the selected row. */
  details?: React.ReactNode;
  /** Always visible warning, even when the row is not selected. */
  notice?: React.ReactNode;
}

const BankTransferSteps = () => (
  <div className="space-y-3 font-sans text-sm">
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 p-2.5 text-xs font-semibold text-emerald-950">
      <Icons.payments.breB className="h-5 w-auto shrink-0" />
      <span>
        <strong>Transferencia sin comisión</strong> desde cualquier banco
        colombiano con <strong>Bre-B</strong> o transferencia directa.
      </span>
    </div>
    <ol className="space-y-2">
      <li className="flex items-start gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          1
        </span>
        <p>Confirma el pedido y verás el valor exacto a transferir.</p>
      </li>
      <li className="flex items-start gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          2
        </span>
        <p className="flex flex-wrap items-center gap-x-2">
          Transfiere a la cuenta de ahorros
          <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
            <Icons.payments.bancolombia className="h-4 w-auto" />
            236-000036-64
          </span>
          o a la llave Bre-B.
        </p>
      </li>
      <li className="flex items-start gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          3
        </span>
        <p className="flex flex-wrap items-center gap-x-2">
          Envíanos el comprobante por
          <Link
            href="https://wa.me/573132582293"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-green-700 hover:underline"
          >
            <Icons.whatsapp className="h-4 w-4" />
            WhatsApp 313 258 2293
          </Link>
        </p>
      </li>
    </ol>
  </div>
);

const BankTransferNotice = () => (
  <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs leading-relaxed text-amber-950">
    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <span>
      <strong>Verificamos cada transferencia manualmente</strong> en horario
      de atención. Tu pedido queda reservado y pasa a «Pagado» cuando la
      confirmemos; te avisamos por WhatsApp y correo.
    </span>
  </p>
);

const PAYMENT_OPTIONS: PaymentMethodOption[] = [
  {
    value: PaymentMethod.Bold,
    label: "Pago en línea",
    summary:
      "Tarjeta de crédito o débito, PSE, Nequi o Bancolombia. Confirmación inmediata.",
    // Neutral icon on purpose: customer-facing copy never names the gateway.
    icon: (props: LucideProps) => <CreditCard {...props} />,
    badges: [
      { name: "Visa", icon: Icons.gateways.visa },
      { name: "Mastercard", icon: Icons.gateways.mastercard },
      { name: "American Express", icon: Icons.gateways.amex },
      { name: "Nequi", icon: Icons.gateways.nequi },
      { name: "Bancolombia", icon: Icons.payments.bancolombia },
    ],
    details: (
      <p className="font-sans text-sm text-muted-foreground">
        Al confirmar vas a la pasarela segura. No se hace ningún cobro hasta
        que apruebes el pago allí, y el pedido se confirma al instante.
      </p>
    ),
  },
  {
    value: PaymentMethod.BankTransfer,
    label: "Transferencia bancaria",
    summary: "Bre-B o Bancolombia, sin comisión.",
    icon: (props: LucideProps) => <Landmark {...props} />,
    badges: [
      { name: "Bre-B (cualquier banco)", icon: Icons.payments.breB },
      { name: "Bancolombia", icon: Icons.payments.bancolombia },
      { name: "Nequi", icon: Icons.gateways.nequi },
      { name: "Davivienda / Daviplata", icon: Icons.payments.davivienda },
      { name: "BBVA", icon: Icons.payments.bbva },
      { name: "Banco de Bogotá", icon: Icons.payments.bancoDeBogota },
    ],
    notice: <BankTransferNotice />,
    details: <BankTransferSteps />,
  },
  {
    value: PaymentMethod.COD,
    label: "Pago contra entrega",
    summary: "Efectivo o datáfono al recibir el paquete.",
    icon: (props: LucideProps) => <HandCoins {...props} />,
    details: (
      <p className="font-sans text-sm text-muted-foreground">
        Pagas en efectivo o con datáfono únicamente cuando recibas tu pedido en
        la dirección de entrega. Disponible solo con transportadoras que lo
        admiten.
      </p>
    ),
  },
];

interface PaymentMethodSelectorProps {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  omit?: PaymentMethod[];
  disabled?: boolean;
  disabledMessages?: Partial<Record<PaymentMethod, string>>;
  ariaLabelledBy?: string;
}

const Badges = ({ badges }: { badges: PaymentMethodBadge[] }) => (
  <span className="flex flex-wrap items-center gap-1">
    {badges.map((badge) => (
      <span
        key={badge.name}
        title={badge.name}
        className="flex h-6 w-10 items-center justify-center rounded border bg-white p-0.5"
      >
        {badge.icon ? (
          <badge.icon className="h-full w-full object-contain" />
        ) : badge.image ? (
          <img
            src={badge.image}
            alt={badge.name}
            className="h-full w-full object-contain"
          />
        ) : null}
        <span className="sr-only">{badge.name}</span>
      </span>
    ))}
  </span>
);

export const PaymentMethodSelector = ({
  value,
  onChange,
  omit = [],
  disabled = false,
  disabledMessages = {},
  ariaLabelledBy,
}: PaymentMethodSelectorProps) => {
  return (
    <div className="space-y-4">
      <RadioGroup
        value={value}
        onValueChange={(val) => onChange(val as PaymentMethod)}
        disabled={disabled}
        aria-labelledby={ariaLabelledBy}
        className="grid grid-cols-1 gap-2.5"
      >
        {PAYMENT_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;
          const isOmitted = omit.includes(option.value);
          const disabledMessage =
            disabledMessages?.[option.value] || "No disponible";

          return (
            <div key={option.value} className="relative">
              <RadioGroupItem
                value={option.value}
                id={`payment-${option.value}`}
                className="peer sr-only"
                disabled={disabled || isOmitted}
                aria-describedby={
                  isOmitted ? `payment-${option.value}-status` : undefined
                }
              />
              <Label
                htmlFor={`payment-${option.value}`}
                className={cn(
                  "flex cursor-pointer flex-col gap-3 rounded-xl border-2 border-muted bg-card p-3.5 font-sans transition-[border-color,background-color] hover:border-primary/50 sm:p-4",
                  "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-blue-purple/10",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                  (disabled || isOmitted) && "cursor-not-allowed opacity-60",
                )}
              >
                <span className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/50",
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  </span>
                  <Icon
                    className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-foreground">
                        {option.label}
                      </span>
                      {isOmitted && (
                        <span
                          id={`payment-${option.value}-status`}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                        >
                          {disabledMessage}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {option.summary}
                    </span>
                  </span>
                  {option.badges && option.badges.length > 0 && (
                    <span className="hidden shrink-0 sm:block">
                      <Badges badges={option.badges} />
                    </span>
                  )}
                </span>
                {option.badges && option.badges.length > 0 && (
                  <span className="pl-8 sm:hidden">
                    <Badges badges={option.badges} />
                  </span>
                )}
                {option.notice && !isOmitted && (
                  <span className="block pl-8">{option.notice}</span>
                )}
                {isSelected && option.details && !isOmitted && (
                  <span className="block pl-8 duration-300 animate-in fade-in-0">
                    {option.details}
                  </span>
                )}
              </Label>
            </div>
          );
        })}
      </RadioGroup>

      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-blue-baby/60 bg-blue-purple/10 p-3 text-xs text-blue-yankees sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="h-4 w-4 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
          <span>
            <strong>Compra segura:</strong> tus datos viajan cifrados.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Icons.whatsapp className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            <strong>¿Dudas?</strong> Te ayudamos por WhatsApp.
          </span>
        </div>
      </div>
    </div>
  );
};
