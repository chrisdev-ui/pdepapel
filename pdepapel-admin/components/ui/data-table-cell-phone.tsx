"use client";

import {
  DEFAULT_PHONE_COUNTRY,
  describePhoneNumber,
  getPhoneCountryLabel,
} from "@/lib/phone-display";
import { cn } from "@/lib/utils";

interface DataTableCellPhoneProps extends React.HTMLAttributes<HTMLDivElement> {
  phoneNumber: string | null;
  /** Fuerza «+57 302 4686403» aunque el número sea colombiano. */
  international?: boolean;
  /**
   * Muestra el país debajo del número. Un número extranjero lo muestra
   * siempre, aunque esto venga apagado: es el dato que evita confundirlo
   * con un celular local.
   */
  showCountry?: boolean;
}

/**
 * Teléfono dentro de una tabla.
 *
 * Los números de WhatsApp llegan sin «+» (573024686403) y así no los reconoce
 * ninguna librería de formato, por eso `describePhoneNumber` prueba las
 * distintas formas en que pueden estar guardados antes de rendirse.
 *
 * Si no se puede interpretar, se muestra tal cual estaba guardado y se dice
 * que no se reconoció: preferimos un dato feo pero cierto a uno inventado.
 */
export function DataTableCellPhone({
  className,
  phoneNumber,
  international = false,
  showCountry = false,
  ...props
}: DataTableCellPhoneProps) {
  if (!phoneNumber) return null;

  const phone = describePhoneNumber(phoneNumber);
  const isForeign = Boolean(phone.country && phone.country !== DEFAULT_PHONE_COUNTRY);
  const countryLabel = getPhoneCountryLabel(phone);

  if (!phone.isValid) {
    return (
      <div className={cn("flex flex-col", className)} {...props}>
        <span className="tabular-nums">{phone.raw}</span>
        <span className="text-xs text-muted-foreground">
          Número no reconocido
        </span>
      </div>
    );
  }

  // Un número de fuera se muestra completo: el prefijo es parte de la señal.
  const display =
    international || isForeign || !phone.national
      ? phone.international
      : phone.national;

  return (
    <div
      className={cn("flex flex-col", className)}
      title={countryLabel ? `${countryLabel} · ${phone.international}` : undefined}
      {...props}
    >
      <span className="tabular-nums">{display}</span>
      {countryLabel && (showCountry || isForeign) ? (
        <span
          className={cn(
            "text-xs",
            isForeign ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {countryLabel}
        </span>
      ) : null}
    </div>
  );
}
