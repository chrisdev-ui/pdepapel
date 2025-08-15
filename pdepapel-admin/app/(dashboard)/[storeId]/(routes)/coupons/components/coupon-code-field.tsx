"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Copy, Dice6, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { generateUniqueCouponCode } from "../server/utils";

interface CouponCodeFieldProps {
  form: UseFormReturn<any>;
  fieldName?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const CouponCodeField: React.FC<CouponCodeFieldProps> = ({
  form,
  fieldName = "code",
  label = "Código del cupón",
  placeholder = "Ingresa o genera un código",
  disabled = false,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const params = useParams();
  const storeId = params.storeId as string;

  const generateAndSetCode = async () => {
    setIsGenerating(true);
    try {
      const result = await generateUniqueCouponCode(storeId);

      if (result.success && result.code) {
        // Set the generated code in the form
        form.setValue(fieldName, result.code);

        toast({
          title: "¡Código generado!",
          description: `Código ${result.code} generado exitosamente`,
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo generar el código",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error inesperado al generar el código",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    const currentValue = form.getValues(fieldName);
    if (currentValue) {
      try {
        await navigator.clipboard.writeText(currentValue);
        toast({
          description: "Código copiado al portapapeles",
          variant: "success",
        });
      } catch (error) {
        toast({
          description: "Error al copiar al portapapeles",
          variant: "destructive",
        });
      }
    }
  };

  const currentValue = form.watch(fieldName);

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldName}>{label}</Label>
      <div className="flex space-x-2">
        <div className="flex-1">
          <Input
            id={fieldName}
            placeholder={placeholder}
            disabled={disabled}
            {...form.register(fieldName)}
            className="uppercase"
            style={{ textTransform: "uppercase" }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={generateAndSetCode}
          disabled={disabled || isGenerating}
          className="px-3"
          title="Generar código aleatorio"
        >
          {isGenerating ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Dice6 className="h-4 w-4" />
          )}
        </Button>
        {currentValue && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            className="px-3"
            title="Copiar código"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
      {form.formState.errors[fieldName] && (
        <p className="text-sm text-red-500">
          {form.formState.errors[fieldName]?.message as string}
        </p>
      )}
    </div>
  );
};
