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
export interface CasualRepliesPreview {
  approved: boolean;
  approvedAt: string | null;
  items: { label: string; text: string }[];
}

/**
 * Lo que el bot contesta a la cortesía: gracias, despedida, «¿eres un robot?»
 * y «¿qué venden?». Se aprueba aparte, así que publicar estos textos no retira
 * el visto bueno de los datos del negocio ni el de productos.
 */
export function CasualRepliesCard({ data }: { data: CasualRepliesPreview }) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const enviar = async (aprobar: boolean) => {
    try {
      setLoading(true);
      const url = `/api/${params.storeId}/bot-casual/approve`;
      if (aprobar) await axios.post(url);
      else await axios.delete(url);
      router.refresh();
      toast({
        description: aprobar
          ? "Listo, el bot ya puede contestar la cortesía"
          : "Retirado: el bot deja de contestar la cortesía",
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
          <CardTitle className="text-base">
            Cortesía y preguntas generales
          </CardTitle>
          <Badge variant={data.approved ? "success" : "warning"}>
            {data.approved ? "Aprobados" : "Sin aprobar"}
          </Badge>
        </div>
        <CardDescription>
          Cuando alguien da las gracias, se despide, pregunta si habla con un
          robot o qué venden, el bot contesta con estos textos fijos. Un «ok»,
          un «listo» o un emoji solo no reciben respuesta. Mientras no los
          apruebes, esos mensajes siguen como hasta ahora.
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
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          La IA solo decide qué tipo de mensaje es; las palabras son siempre
          estas. Si la IA no responde, el bot sigue con tus palabras clave y, si
          tampoco, te lo pasa a ti.
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
