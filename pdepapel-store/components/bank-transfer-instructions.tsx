"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Copy,
  Check,
  Smartphone,
  Building2,
  ExternalLink,
  ShieldCheck,
  Zap,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Icons } from "@/components/icons";
import { currencyFormatter } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface BankTransferInstructionsProps {
  order: {
    id: string;
    orderNumber: string;
    total: number;
    fullName?: string;
  };
  compact?: boolean;
}

export const BankTransferInstructions: React.FC<
  BankTransferInstructionsProps
> = ({ order, compact = false }) => {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const breBKey = "@sitiowebpdepapel";
  const bancolombiaAccount = "236-000036-64";
  const whatsappNumber = "573132582293";
  const formattedTotal = currencyFormatter.format(order.total);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast({
      title: "¡Copiado con éxito!",
      description: `${label}: ${text}`,
      variant: "success",
    });
    setTimeout(() => setCopiedField(null), 2500);
  };

  const whatsappMessage = encodeURIComponent(
    `¡Hola P de Papel! 👋 Adjunto el comprobante de pago por transferencia para la Orden #${order.orderNumber} por valor de ${formattedTotal}.`,
  );
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  return (
    <Card className="w-full overflow-hidden border-2 border-purple-200/90 bg-gradient-to-b from-purple-50/40 via-white to-pink-50/20 shadow-md dark:border-purple-900/60 dark:from-purple-950/30 dark:via-zinc-900 dark:to-pink-950/20">
      {/* Header - Single column flow for narrow sidebars */}
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm dark:bg-purple-500">
                <Zap className="h-4 w-4" />
              </div>
              <CardTitle className="font-sans text-base font-bold text-purple-950 dark:text-purple-100 sm:text-lg">
                Transferencia Directa / Bre-B
              </CardTitle>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-purple-300 bg-purple-100/80 text-[10px] font-semibold text-purple-900 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-200"
            >
              Pago Inmediato
            </Badge>
          </div>
          <p className="text-xs text-purple-700/90 dark:text-purple-300">
            Paga fácilmente sin comisiones adicionales
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 pt-1 sm:p-5 sm:pt-1">
        {/* Exact Amount Banner - Clean 2-row layout */}
        <div className="flex flex-col gap-3 rounded-2xl border border-purple-100 bg-white p-3.5 shadow-sm dark:border-purple-900/40 dark:bg-zinc-900">
          <div className="space-y-0.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Monto exacto a transferir:
            </span>
            <div className="font-quicksand text-2xl font-bold text-purple-950 dark:text-purple-100">
              {formattedTotal}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-purple-50 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full border-purple-200 bg-purple-50/60 px-2 text-xs font-semibold text-purple-950 hover:bg-purple-100 hover:text-purple-950 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200"
              onClick={() =>
                copyToClipboard(order.total.toString(), "Valor de la orden")
              }
            >
              {copiedField === "Valor de la orden" ? (
                <Check className="mr-1.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
              )}
              Copiar Valor
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full border-purple-200 bg-purple-50/60 px-2 text-xs font-semibold text-purple-950 hover:bg-purple-100 hover:text-purple-950 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200"
              onClick={() =>
                copyToClipboard(order.orderNumber, "Número de Orden")
              }
            >
              {copiedField === "Número de Orden" ? (
                <Check className="mr-1.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
              )}
              Copiar Orden
            </Button>
          </div>
        </div>

        {/* Transfer Options Tabs */}
        <Tabs defaultValue="breb" className="w-full space-y-3">
          <TabsList className="grid w-full grid-cols-2 rounded-xl bg-purple-100/70 p-1 dark:bg-purple-950/60">
            <TabsTrigger
              value="breb"
              className="flex items-center justify-center h-9 rounded-lg font-sans text-xs font-bold text-purple-900 transition-all data-[state=active]:bg-white data-[state=active]:text-purple-950 data-[state=active]:shadow-sm dark:text-purple-200 dark:data-[state=active]:bg-zinc-900 dark:data-[state=active]:text-purple-100"
            >
              <Smartphone className="mr-1.5 h-3.5 w-3.5 shrink-0 text-pink-600" />
              Bre-B / Nequi / QR
            </TabsTrigger>
            <TabsTrigger
              value="bancolombia"
              className="flex items-center justify-center h-9 rounded-lg font-sans text-xs font-bold text-purple-900 transition-all data-[state=active]:bg-white data-[state=active]:text-purple-950 data-[state=active]:shadow-sm dark:text-purple-200 dark:data-[state=active]:bg-zinc-900 dark:data-[state=active]:text-purple-100"
            >
              <Building2 className="mr-1.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
              Bancolombia
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Bre-B & QR */}
          <TabsContent value="breb" className="m-0 space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-purple-100 bg-white p-3.5 shadow-sm dark:border-purple-900/40 dark:bg-zinc-900">
              {/* QR Image Preview Card */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-purple-200/80 bg-purple-50/40 p-3 text-center dark:border-purple-900/50 dark:bg-purple-950/20">
                <Dialog open={qrOpen} onOpenChange={setQrOpen}>
                  <DialogTrigger asChild>
                    <div className="group relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-purple-300 bg-white p-2.5 shadow-sm transition-all duration-200 hover:border-purple-500 hover:shadow-md dark:border-purple-800 dark:bg-zinc-900">
                      <Image
                        src="/images/qr-bre-b.jpeg"
                        alt="Código QR Bre-B / Bancolombia / Nequi"
                        width={260}
                        height={260}
                        priority
                        className="h-44 w-44 object-contain transition-transform duration-200 group-hover:scale-105 sm:h-48 sm:w-48"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-purple-950/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <span className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-purple-950 shadow-md">
                          <ZoomIn className="h-4 w-4 text-purple-600" /> Toca
                          para Ampliar
                        </span>
                      </div>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="w-[92vw] max-w-md rounded-2xl p-4 text-center sm:max-w-lg sm:p-6">
                    <DialogHeader>
                      <DialogTitle className="text-center font-sans text-lg font-bold text-purple-950 dark:text-purple-100 sm:text-xl">
                        Código QR Bre-B / Bancolombia
                      </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center justify-center space-y-4 py-2">
                      <div className="relative overflow-hidden rounded-2xl border-4 border-purple-100 bg-white p-3 shadow-xl dark:border-purple-900 dark:bg-zinc-900">
                        <Image
                          src="/images/qr-bre-b.jpeg"
                          alt="Código QR Bre-B / Bancolombia"
                          width={400}
                          height={400}
                          priority
                          className="h-auto w-full max-w-[340px] rounded-lg object-contain sm:max-w-[380px]"
                        />
                      </div>
                      <div className="rounded-xl bg-purple-50 p-3 text-xs text-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
                        <p className="font-semibold">
                          📱 ¿Cómo escanear este código?
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Abre tu aplicación bancaria (Nequi, Bancolombia a la
                          mano, Daviplata, Nu, etc.) y selecciona la opción de{" "}
                          <strong>Escanear QR Bre-B</strong>.
                        </p>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 dark:text-purple-300"
                >
                  <ZoomIn className="h-3.5 w-3.5 text-purple-600" />
                  Ver QR en pantalla completa
                </button>
              </div>

              {/* Llave Bre-B Box - Removed "(INTEROPERABLE)" */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                  Llave Bre-B:
                </span>
                <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/50 p-2.5 dark:border-purple-900/60 dark:bg-purple-950/30">
                  <code className="font-mono text-sm font-bold text-purple-950 dark:text-purple-100 truncate pr-2">
                    {breBKey}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 border-purple-200 bg-white px-2.5 text-xs font-semibold text-purple-950 hover:bg-purple-100 dark:border-purple-800 dark:bg-zinc-900 dark:text-purple-200"
                    onClick={() => copyToClipboard(breBKey, "Llave Bre-B")}
                  >
                    {copiedField === "Llave Bre-B" ? (
                      <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="mr-1 h-3.5 w-3.5 text-purple-600" />
                    )}
                    Copiar
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  Transferencia gratis desde cualquier banco colombiano.
                </span>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: Bancolombia */}
          <TabsContent value="bancolombia" className="m-0 space-y-3">
            <div className="space-y-3 rounded-2xl border border-purple-100 bg-white p-3.5 shadow-sm dark:border-purple-900/40 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b pb-2.5 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Icons.payments.bancolombia className="h-5 w-auto" />
                  <span className="font-sans text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Bancolombia - Cuenta Ahorros
                  </span>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-blue-50 text-[10px] text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                >
                  Ahorros
                </Badge>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                  Número de Cuenta:
                </span>
                <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/50 p-2.5 dark:border-blue-900/60 dark:bg-blue-950/30">
                  <code className="font-mono text-base font-bold text-blue-950 dark:text-blue-100 truncate pr-2">
                    {bancolombiaAccount}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 border-blue-200 bg-white px-2.5 text-xs font-semibold text-blue-950 hover:bg-blue-100 dark:border-blue-800 dark:bg-zinc-900 dark:text-blue-200"
                    onClick={() =>
                      copyToClipboard(
                        bancolombiaAccount,
                        "Número de cuenta Bancolombia",
                      )
                    }
                  >
                    {copiedField === "Número de cuenta Bancolombia" ? (
                      <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="mr-1 h-3.5 w-3.5 text-blue-600" />
                    )}
                    Copiar
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* WhatsApp Receipt Action CTA */}
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <span className="flex items-center text-xs font-bold text-emerald-950 dark:text-emerald-200">
                <Icons.whatsapp className="mr-1.5 h-4 w-4 shrink-0 text-[#25D366]" />
                Paso Final: Envía tu comprobante
              </span>
              <p className="text-xs text-emerald-900/80 dark:text-emerald-300 leading-relaxed">
                Envía una foto o captura del comprobante al WhatsApp{" "}
                <strong>313-258-2293</strong> para procesar tu pedido de
                inmediato.
              </p>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full"
            >
              <Button
                type="button"
                className="h-11 w-full bg-[#25D366] text-white font-bold hover:bg-[#20bd5a] active:scale-[0.98] shadow-md transition-all duration-200 flex items-center justify-center gap-2 rounded-xl text-sm"
              >
                <Icons.whatsapp className="h-5 w-5 text-white" />
                Enviar Comprobante por WhatsApp
                <ExternalLink className="h-4 w-4 opacity-80" />
              </Button>
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
