"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Copy,
  Check,
  QrCode,
  Smartphone,
  Building2,
  Send,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Zap,
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
      title: "Copiado",
      description: `${label} copiado al portapapeles: ${text}`,
      variant: "success",
    });
    setTimeout(() => setCopiedField(null), 2500);
  };

  const whatsappMessage = encodeURIComponent(
    `¡Hola P de Papel! 👋 Adjunto el comprobante de pago por transferencia para la Orden #${order.orderNumber} por valor de ${formattedTotal}.`,
  );
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  return (
    <Card className="overflow-hidden border-2 border-amber-200/80 bg-gradient-to-b from-amber-50/60 to-orange-50/30 shadow-md dark:border-amber-900/50 dark:from-amber-950/20 dark:to-orange-950/10">
      <CardHeader className="pb-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="font-sans text-base font-bold text-amber-900 dark:text-amber-200 sm:text-lg">
                Paga por Transferencia Directa o Bre-B
              </CardTitle>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Usa tu app bancaria sin comisiones adicionales
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          >
            <Sparkles className="mr-1 h-3 w-3 text-amber-600" />
            Pago Inmediato
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quick Amount & Order Banner */}
        <div className="flex flex-wrap items-center justify-between rounded-xl border border-amber-200 bg-white p-3.5 shadow-sm dark:border-amber-900/60 dark:bg-zinc-900">
          <div>
            <span className="text-xs text-muted-foreground">
              Monto exacto a transferir:
            </span>
            <div className="font-quicksand text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formattedTotal}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-amber-200 bg-amber-50 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              onClick={() =>
                copyToClipboard(order.total.toString(), "Valor de la orden")
              }
            >
              {copiedField === "Valor de la orden" ? (
                <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="mr-1 h-3.5 w-3.5" />
              )}
              Copiar Valor
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-amber-200 bg-amber-50 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              onClick={() =>
                copyToClipboard(order.orderNumber, "Número de Orden")
              }
            >
              {copiedField === "Número de Orden" ? (
                <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="mr-1 h-3.5 w-3.5" />
              )}
              Copiar Referencia
            </Button>
          </div>
        </div>

        {/* Tabbed Transfer Options */}
        <Tabs defaultValue="breb" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-lg bg-amber-100/80 p-1 dark:bg-amber-950/60">
            <TabsTrigger
              value="breb"
              className="rounded-md font-sans text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-amber-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-zinc-900 dark:data-[state=active]:text-amber-200"
            >
              <Smartphone className="mr-1.5 h-3.5 w-3.5 text-pink-600" />
              Bre-B / Nequi / QR
            </TabsTrigger>
            <TabsTrigger
              value="bancolombia"
              className="rounded-md font-sans text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-amber-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-zinc-900 dark:data-[state=active]:text-amber-200"
            >
              <Building2 className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
              Bancolombia
            </TabsTrigger>
          </TabsList>

          {/* Bre-B / Nequi / QR Tab Content */}
          <TabsContent value="breb" className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              {/* QR Image Preview Card */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-white p-3 text-center shadow-sm dark:border-amber-900/60 dark:bg-zinc-900 sm:col-span-5">
                <Dialog open={qrOpen} onOpenChange={setQrOpen}>
                  <DialogTrigger asChild>
                    <div className="group relative cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-2 transition hover:border-amber-500">
                      <Image
                        src="/images/qr-bre-b.jpeg"
                        alt="Código QR Bre-B / Bancolombia / Nequi"
                        width={140}
                        height={140}
                        className="h-32 w-32 object-contain transition duration-200 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition duration-200 group-hover:opacity-100">
                        <span className="flex items-center rounded-md bg-white px-2 py-1 text-xs font-semibold text-zinc-900 shadow">
                          <QrCode className="mr-1 h-3.5 w-3.5" /> Ampliar QR
                        </span>
                      </div>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-xs text-center sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-center font-sans text-lg font-bold">
                        Código QR Bre-B / Bancolombia
                      </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center justify-center p-2">
                      <Image
                        src="/images/qr-bre-b.jpeg"
                        alt="Código QR Bre-B / Bancolombia"
                        width={300}
                        height={300}
                        className="h-64 w-64 rounded-lg object-contain shadow-md"
                      />
                      <p className="mt-3 text-xs text-muted-foreground">
                        Escanea este código desde la app de Nequi, Bancolombia a
 me, Daviplata o cualquier entidad de la red Bre-B.
                      </p>
                    </div>
                  </DialogContent>
                </Dialog>
                <p className="mt-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                  Haz clic en el QR para ampliar
                </p>
              </div>

              {/* Bre-B Key Details */}
              <div className="flex flex-col justify-center space-y-2.5 rounded-xl border border-amber-200 bg-white p-3.5 shadow-sm dark:border-amber-900/60 dark:bg-zinc-900 sm:col-span-7">
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Llave Bre-B (Interoperable):
                  </span>
                  <div className="mt-1 flex items-center justify-between rounded-lg bg-amber-50/80 px-3 py-2 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900">
                    <code className="font-mono text-sm font-bold text-amber-900 dark:text-amber-200">
                      {breBKey}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs font-medium text-amber-800 hover:bg-amber-200/60 dark:text-amber-300"
                      onClick={() => copyToClipboard(breBKey, "Llave Bre-B")}
                    >
                      {copiedField === "Llave Bre-B" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="flex items-center text-zinc-700 dark:text-zinc-300">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                    Acepta transferencias sin costo desde cualquier banco colombiano.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Bancolombia Tab Content */}
          <TabsContent value="bancolombia" className="mt-3 space-y-3">
            <div className="rounded-xl border border-amber-200 bg-white p-3.5 shadow-sm dark:border-amber-900/60 dark:bg-zinc-900 space-y-3">
              <div className="flex items-center justify-between border-b pb-2.5 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Icons.payments.bancolombia className="h-5 w-auto" />
                  <span className="font-sans text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    Bancolombia - Cuenta de Ahorros
                  </span>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Ahorros
                </Badge>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Número de Cuenta:
                </span>
                <div className="mt-1 flex items-center justify-between rounded-lg bg-blue-50/80 px-3 py-2 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900">
                  <code className="font-mono text-base font-bold text-blue-900 dark:text-blue-200">
                    {bancolombiaAccount}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs font-medium text-blue-800 hover:bg-blue-200/60 dark:text-blue-300"
                    onClick={() =>
                      copyToClipboard(
                        bancolombiaAccount,
                        "Número de cuenta Bancolombia",
                      )
                    }
                  >
                    {copiedField === "Número de cuenta Bancolombia" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* WhatsApp Receipt Action CTA */}
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/80 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <span className="flex items-center text-xs font-bold text-emerald-900 dark:text-emerald-200">
                <Icons.whatsapp className="mr-1.5 h-4 w-4 text-emerald-600" />
                Paso final: Envía tu comprobante
              </span>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                Envía una foto o captura del comprobante al WhatsApp{" "}
                <strong>313-258-2293</strong> para procesar tu pedido de inmediato.
              </p>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button
                type="button"
                className="w-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-sm"
                size="sm"
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Enviar Comprobante
                <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
              </Button>
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
