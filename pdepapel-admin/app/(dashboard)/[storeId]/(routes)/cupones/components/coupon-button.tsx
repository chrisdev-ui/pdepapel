"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Copy, Dice6, MoreHorizontal } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  generateMultipleUniqueCouponCodes,
  generateUniqueCouponCode,
} from "../server/utils";

interface CouponCodeGeneratorProps {
  onCodeGenerated?: (code: string) => void;
  onCodesGenerated?: (codes: string[]) => void;
  variant?: "button" | "dropdown";
  disabled?: boolean;
}

export const CouponCodeGenerator: React.FC<CouponCodeGeneratorProps> = ({
  onCodeGenerated,
  onCodesGenerated,
  variant = "button",
  disabled = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const params = useParams();
  const storeId = params.storeId as string;

  const generateSingleCode = async () => {
    setIsLoading(true);
    try {
      const result = await generateUniqueCouponCode(storeId);

      if (result.success && result.code) {
        // Copy to clipboard
        await navigator.clipboard.writeText(result.code);

        toast({
          title: "¡Código generado!",
          description: `Código ${result.code} copiado al portapapeles`,
          variant: "success",
        });

        // Call the callback if provided
        onCodeGenerated?.(result.code);
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
      setIsLoading(false);
    }
  };

  const generateMultipleCodes = async (count: number) => {
    setIsLoading(true);
    try {
      const result = await generateMultipleUniqueCouponCodes(storeId, count);

      if (result.success && result.codes) {
        // Copy all codes to clipboard
        const codesText = result.codes.join("\n");
        await navigator.clipboard.writeText(codesText);

        toast({
          title: "¡Códigos generados!",
          description: `${result.codes.length} códigos generados y copiados al portapapeles`,
          variant: "success",
        });

        // Call the callback if provided
        onCodesGenerated?.(result.codes);
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudieron generar los códigos",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error inesperado al generar los códigos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (variant === "dropdown") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled || isLoading}>
            <Dice6 className="mr-2 h-4 w-4" />
            Generar código
            <MoreHorizontal className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={generateSingleCode}
            disabled={isLoading}
            className="cursor-pointer"
          >
            <Dice6 className="mr-2 h-4 w-4" />
            Generar 1 código
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => generateMultipleCodes(5)}
            disabled={isLoading}
            className="cursor-pointer"
          >
            <Copy className="mr-2 h-4 w-4" />
            Generar 5 códigos
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => generateMultipleCodes(10)}
            disabled={isLoading}
            className="cursor-pointer"
          >
            <Copy className="mr-2 h-4 w-4" />
            Generar 10 códigos
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => generateMultipleCodes(25)}
            disabled={isLoading}
            className="cursor-pointer"
          >
            <Copy className="mr-2 h-4 w-4" />
            Generar 25 códigos
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={generateSingleCode}
      disabled={disabled || isLoading}
    >
      <Dice6 className="mr-2 h-4 w-4" />
      {isLoading ? "Generando..." : "Generar código"}
    </Button>
  );
};
