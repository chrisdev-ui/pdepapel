"use client";

import axios from "axios";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { ProductAnswersPreview } from "./product-answers-card";

/**
 * Pedidos, envío y web: el «sí» a un producto ofrecido pasa el pedido a Paula,
 * la pregunta por el valor del envío se contesta con lo que hay en los
 * ajustes, y quien llega desde la tienda web recibe un saludo según la página.
 * Apagado hasta que Paula lo apruebe aquí.
 */
export function OrderAnswersCard({ data }: { data: ProductAnswersPreview }) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const enviar = async (aprobar: boolean) => {
    try {
      setLoading(true);
      const url = `/api/${params.storeId}/bot-orders/approve`;
      if (aprobar) await axios.post(url);
      else await axios.delete(url);
      router.refresh();
      toast({
        description: aprobar
          ? "Listo, el bot ya pasa los pedidos, contesta el envío y saluda a quien llega de la web"
          : "Retirado: el bot vuelve a como estaba antes",
        variant: "success",
      });
    } catch {
      toast({ description: "No se pudo guardar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Pedidos, envío y web</CardTitle>
          <Badge variant={data.approved ? "success" : "warning"}>
            {data.approved ? "Aprobados" : "Sin aprobar"}
          </Badge>
        </div>
        <CardDescription>
          Cuando el bot ofrece un producto con «¿Lo quieres?» y la clienta dice que sí, no aparta ni cobra nada: te pasa el
          pedido con lo que pidió, la cantidad y el precio que le mostró, y te aparece como tarjeta en la conversación. Si
          pregunta cuánto vale el envío, le dice lo que tienes en los ajustes y te lo pasa. Si escribe con el botón de WhatsApp
          de la tienda web, la saluda según la página de donde viene (un producto, su carrito, un pedido) en un solo mensaje.
          Los nombres y precios de abajo son de ejemplo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li key={item.label} className="text-sm">
              <p className="font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-1 whitespace-pre-line rounded-md bg-muted/60 p-2">
                {item.text}
              </p>
            </li>
          ))}
        </ul>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Sin tu aprobación todo sigue como hoy: un «sí» después de una oferta te llega como «Esa no me la sé» y los mensajes
          de la web reciben la bienvenida de siempre.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={loading}
            onClick={() => enviar(!data.approved)}
            variant={data.approved ? "outline" : "default"}
          >
            {data.approved ? (
              "Retirar aprobación"
            ) : (
              <>
                <CheckCircle2 aria-hidden className="mr-2 h-4 w-4" />
                Aprobar estos textos
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
