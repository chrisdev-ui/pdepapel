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
export interface ProductAnswersPreview {
  approved: boolean;
  approvedAt: string | null;
  items: { label: string; text: string }[];
}

/**
 * Lo que el bot contesta cuando le preguntan por productos.
 *
 * Se aprueba aparte de los datos del negocio: así publicar textos nuevos aquí
 * no retira el visto bueno de allá.
 */
export function ProductAnswersCard({ data }: { data: ProductAnswersPreview }) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const enviar = async (aprobar: boolean) => {
    try {
      setLoading(true);
      const url = `/api/${params.storeId}/bot-products/approve`;
      if (aprobar) await axios.post(url);
      else await axios.delete(url);
      router.refresh();
      toast({
        description: aprobar
          ? "Listo, el bot ya puede contestar sobre productos"
          : "Retirado: el bot deja de contestar sobre productos",
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
          <CardTitle className="text-base">Preguntas por productos</CardTitle>
          <Badge variant={data.approved ? "success" : "warning"}>
            {data.approved ? "Aprobados" : "Sin aprobar"}
          </Badge>
        </div>
        <CardDescription>
          Cuando alguien pregunta si tienes algo o si todavía queda, el bot
          busca en tu catálogo y contesta así. Los nombres y precios de abajo
          son de ejemplo: lo que salga de verdad depende de lo que pregunten.
          Nunca dice cuántas unidades quedan, solo si hay o no hay.
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
          Para entender la pregunta esto usa la misma IA del asistente de
          respuestas. Si se queda sin cuota, el bot no se calla: sigue con tus
          palabras clave y, si tampoco, te lo pasa a ti.
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
