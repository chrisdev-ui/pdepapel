"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Dice6, Download } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { generateMultipleUniqueCouponCodes } from "../server/utils";

export const BulkCouponCodeGenerator = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [count, setCount] = useState(10);
  const [length, setLength] = useState(8);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const { toast } = useToast();
  const params = useParams();
  const storeId = params.storeId as string;

  const generateCodes = async () => {
    if (count < 1 || count > 50) {
      toast({
        title: "Error",
        description: "Debes generar entre 1 y 50 códigos",
        variant: "destructive",
      });
      return;
    }

    if (length < 4 || length > 12) {
      toast({
        title: "Error",
        description: "La longitud debe estar entre 4 y 12 caracteres",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateMultipleUniqueCouponCodes(
        storeId,
        count,
        length,
      );

      if (result.success && result.codes) {
        setGeneratedCodes(result.codes);
        toast({
          title: "¡Códigos generados!",
          description: `${result.codes.length} códigos únicos generados exitosamente`,
          variant: "success",
        });
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
      setIsGenerating(false);
    }
  };

  const copyAllCodes = async () => {
    if (generatedCodes.length === 0) return;

    try {
      const codesText = generatedCodes.join("\n");
      await navigator.clipboard.writeText(codesText);
      toast({
        description: "Todos los códigos copiados al portapapeles",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: "Error al copiar al portapapeles",
        variant: "destructive",
      });
    }
  };

  const downloadCodes = () => {
    if (generatedCodes.length === 0) return;

    const content = generatedCodes.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coupon-codes-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      description: "Códigos descargados exitosamente",
      variant: "success",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Dice6 className="mr-2 h-4 w-4" />
          Generar códigos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generar códigos de cupón</DialogTitle>
          <DialogDescription>
            Genera múltiples códigos únicos de cupón de forma automática
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="count">Cantidad</Label>
              <Input
                id="count"
                type="number"
                min="1"
                max="50"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 10)}
                placeholder="10"
              />
            </div>
            <div>
              <Label htmlFor="length">Longitud</Label>
              <Input
                id="length"
                type="number"
                min="4"
                max="12"
                value={length}
                onChange={(e) => setLength(parseInt(e.target.value) || 8)}
                placeholder="8"
              />
            </div>
          </div>

          <Button
            onClick={generateCodes}
            disabled={isGenerating}
            className="w-full"
          >
            {isGenerating ? "Generando..." : "Generar códigos"}
          </Button>

          {generatedCodes.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyAllCodes}
                  className="flex-1"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadCodes}
                  className="flex-1"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Descargar
                </Button>
              </div>

              <div>
                <Label>Códigos generados ({generatedCodes.length})</Label>
                <Textarea
                  value={generatedCodes.join("\n")}
                  readOnly
                  className="mt-1 font-mono text-sm"
                  rows={Math.min(generatedCodes.length, 10)}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
