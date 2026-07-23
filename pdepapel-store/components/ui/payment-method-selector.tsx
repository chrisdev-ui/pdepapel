/* eslint-disable @next/next/no-img-element */
import { Icons } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PaymentMethod } from "@/constants";
import { cn } from "@/lib/utils";
import { Info, LucideProps } from "lucide-react";
import Link from "next/link";

interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
  icon: (props: LucideProps) => JSX.Element;
  badges?: {
    name: string;
    icon?: (props: LucideProps) => JSX.Element;
    image?: string;
  }[];
  description: React.ReactNode;
}

const BankTransferSteps = () => (
  <div className="space-y-3 font-serif text-sm">
    <div className="flex items-start gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        1
      </span>
      <p>Verifica el valor a transferir al finalizar tu orden.</p>
    </div>
    <div className="flex items-start gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        2
      </span>
      <div className="flex gap-1">
        <p className="inline-flex items-center gap-2">
          Realiza una transferencia bancaria a la siguiente Cuenta de Ahorros:
        </p>
        <div className="inline-flex items-center gap-2 font-bold text-foreground">
          <Icons.payments.bancolombia className="h-5 w-auto" />
          <span>236-000036-64</span>
        </div>
      </div>
    </div>
    <div className="flex items-start gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        3
      </span>
      <div className="flex gap-1">
        <p className="inline-flex items-center gap-2">
          Envíanos una imagen de la transferencia al siguiente número:
        </p>
        <Link
          href="https://wa.me/573132582293"
          target="_blank"
          className="inline-flex items-center gap-2 font-bold text-green-600 hover:underline"
        >
          <Icons.whatsapp className="h-4 w-4" />
          <span>313 258 2293</span>
        </Link>
      </div>
    </div>
  </div>
);

const GatewayLogos = ({
  gateways,
}: {
  gateways: {
    name: string;
    icon?: (props: LucideProps) => JSX.Element;
    image?: string;
  }[];
}) => (
  <div className="mt-2 flex flex-wrap items-center gap-3">
    <TooltipProvider>
      {gateways.map((gateway) => (
        <Tooltip key={gateway.name}>
          <TooltipTrigger asChild>
            <div className="flex h-8 w-12 cursor-help items-center justify-center rounded border bg-white p-1 shadow-sm transition-colors hover:border-primary/50">
              {gateway.icon ? (
                <gateway.icon className="h-full w-full object-contain" />
              ) : gateway.image ? (
                <img
                  src={gateway.image}
                  alt={gateway.name}
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{gateway.name}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </TooltipProvider>
    <span className="text-xs text-muted-foreground">+ más opciones</span>
  </div>
);

const PAYMENT_OPTIONS: PaymentMethodOption[] = [
  {
    value: PaymentMethod.Wompi,
    label: "Pago en línea (Tarjeta de crédito / débito, PSE, Nequi)",
    icon: Icons.payments.wompi,
    badges: [
      { name: "Visa", icon: Icons.gateways.visa },
      { name: "Mastercard", icon: Icons.gateways.mastercard },
      { name: "American Express", icon: Icons.gateways.amex },
      { name: "Nequi", icon: Icons.gateways.nequi },
      { name: "Bancolombia", icon: Icons.payments.bancolombia },
    ],
    description: (
      <div className="font-serif text-sm">
        <p className="mb-2">
          Paga de forma segura con tarjeta de crédito o débito, transfiere con
          tu cuenta Bancolombia, Nequi, PSE, Daviplata o paga en efectivo en corresponsal bancario.
        </p>
        <GatewayLogos
          gateways={[
            { name: "Visa", icon: Icons.gateways.visa },
            { name: "Mastercard", icon: Icons.gateways.mastercard },
            { name: "American Express", icon: Icons.gateways.amex },
            { name: "Nequi", icon: Icons.gateways.nequi },
            { name: "Bancolombia", icon: Icons.payments.bancolombia },
          ]}
        />
      </div>
    ),
  },
  {
    value: PaymentMethod.BankTransfer,
    label: "Transferencia bancaria directa (Bancolombia / Nequi)",
    icon: Icons.payments.transfer,
    badges: [
      { name: "Bancolombia", icon: Icons.payments.bancolombia },
      { name: "Nequi", icon: Icons.gateways.nequi },
    ],
    description: <BankTransferSteps />,
  },
  {
    value: PaymentMethod.COD,
    label: "Pago contra entrega (Efectivo / Datáfono)",
    icon: Icons.payments.cashOnDelivery,
    badges: [
      { name: "Pago en Efectivo / Datáfono", icon: Icons.payments.cashOnDelivery },
    ],
    description:
      "Paga en efectivo o datáfono únicamente cuando recibas tu pedido en la dirección de entrega. Disponible solo en zonas con cobertura.",
  },
];

interface PaymentMethodSelectorProps {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  omit?: PaymentMethod[];
  disabled?: boolean;
  disabledMessages?: Partial<Record<PaymentMethod, string>>;
}

export const PaymentMethodSelector = ({
  value,
  onChange,
  omit = [],
  disabled = false,
  disabledMessages = {},
}: PaymentMethodSelectorProps) => {
  // Separate available and omitted options
  const availableOptions = PAYMENT_OPTIONS.filter(
    (option) => !omit.includes(option.value),
  );
  const omittedOptions = PAYMENT_OPTIONS.filter((option) =>
    omit.includes(option.value),
  );

  // Find selected option for info display
  const selectedOption = availableOptions.find((opt) => opt.value === value);

  return (
    <div className="space-y-6">
      <RadioGroup
        value={value}
        onValueChange={(val) => onChange(val as PaymentMethod)}
        disabled={disabled}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {availableOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;

          return (
            <div key={option.value} className="relative">
              <RadioGroupItem
                value={option.value}
                id={`payment-${option.value}`}
                className="peer sr-only"
              />
              <Label
                htmlFor={`payment-${option.value}`}
                className={cn(
                  "group flex cursor-pointer flex-col items-center gap-4 rounded-lg border-2 border-muted bg-card p-6 transition-all duration-300 hover:border-primary/50 hover:shadow-lg",
                  "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:shadow-xl",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {/* Icon with shine effect - no circle */}
                <div className="relative h-16 w-16 overflow-hidden">
                  <Icon className="relative z-10 h-full w-full text-foreground transition-colors duration-300 group-hover:text-primary" />
                  {/* Shine overlay - now on top (z-20) and more visible */}
                  <div className="absolute inset-0 z-20 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </div>

                {/* Label & Visual Badges */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="font-semibold text-foreground">
                    {option.label}
                  </p>

                  {/* Brand Logos Badges */}
                  {option.badges && option.badges.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                      {option.badges.map((badge) => (
                        <div
                          key={badge.name}
                          title={badge.name}
                          className="flex h-7 w-11 items-center justify-center rounded border bg-white p-1 shadow-2xs transition-transform duration-200 group-hover:scale-105"
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected indicator with animation */}
                {isSelected && (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground duration-200 animate-in zoom-in-50">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </Label>
            </div>
          );
        })}

        {/* Omitted payment methods with status badge */}
        {omittedOptions.map((option) => {
          const Icon = option.icon;
          const disabledMessage = disabledMessages?.[option.value] || "Próximamente";

          return (
            <div key={option.value} className="relative">
              <div className="flex cursor-not-allowed flex-col items-center gap-4 rounded-lg border-2 border-dashed border-muted bg-muted/20 p-6 opacity-60">
                {/* Icon - grayscale and smaller */}
                <div className="relative h-16 w-16">
                  <Icon className="h-full w-full text-muted-foreground grayscale" />
                </div>

                {/* Label */}
                <div className="text-center">
                  <p className="font-semibold text-muted-foreground">
                    {option.label}
                  </p>
                </div>

                {/* Status badge - static */}
                <div className="absolute right-2 top-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm">
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {disabledMessage}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </RadioGroup>

      {/* Info Alert - Shows when a method is selected */}
      {selectedOption && (
        <Alert className="duration-500 animate-in fade-in-50 slide-in-from-top-2">
          <Info className="h-4 w-4" />
          <AlertDescription className="ml-2">
            {selectedOption.description}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
