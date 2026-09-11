"use client";

import { Copy, Dice6, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { normalizeCouponCode } from "@/lib/coupon-code";

import { generateUniqueCouponCode } from "../server/utils";

interface CouponCodeFieldProps {
  form: UseFormReturn<any>;
  fieldName?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Id del control, para que `FormLabel` lo enlace. */
  id?: string;
}

/**
 * Campo del código con «proponer uno» y «copiar». Solo pinta el control: la
 * etiqueta y el mensaje de error los pone el `FormItem` que lo envuelve.
 */
export const CouponCodeField: React.FC<CouponCodeFieldProps> = ({
  form,
  fieldName = "code",
  placeholder = "Escribe o genera un código",
  disabled = false,
  id,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const params = useParams();
  const storeId = String(params.storeId);

  const generateAndSetCode = async () => {
    setIsGenerating(true);
    try {
      const result = await generateUniqueCouponCode(storeId);
      if (result.success && result.code) {
        form.setValue(fieldName, result.code, { shouldDirty: true, shouldValidate: true });
        toast({ description: `Código ${result.code} propuesto`, variant: "success" });
      } else {
        toast({ description: result.error || "No se pudo generar el código", variant: "destructive" });
      }
    } catch {
      toast({ description: "No se pudo generar el código", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    const currentValue = form.getValues(fieldName);
    if (!currentValue) return;
    try {
      await navigator.clipboard.writeText(currentValue);
      toast({ description: "Código copiado al portapapeles", variant: "success" });
    } catch {
      toast({ description: "No se pudo copiar al portapapeles", variant: "destructive" });
    }
  };

  const currentValue = form.watch(fieldName);
  const inputRegistration = form.register(fieldName);

  return (
    <div className="flex gap-2">
      <Input
        id={id ?? fieldName}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={20}
        {...inputRegistration}
        onChange={(event) => {
          event.target.value = normalizeCouponCode(event.target.value);
          inputRegistration.onChange(event);
        }}
        className="font-mono uppercase"
      />
      <Button type="button" variant="outline" size="icon" onClick={generateAndSetCode} disabled={disabled || isGenerating} aria-label="Proponer un código aleatorio" title="Proponer un código aleatorio">
        {isGenerating ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Dice6 className="h-4 w-4" aria-hidden="true" />}
      </Button>
      {currentValue ? (
        <Button type="button" variant="outline" size="icon" onClick={copyToClipboard} aria-label="Copiar código" title="Copiar código">
          <Copy className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
};
