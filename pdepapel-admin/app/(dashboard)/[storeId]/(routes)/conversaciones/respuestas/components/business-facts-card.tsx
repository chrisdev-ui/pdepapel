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
import type { BusinessFactIntent } from "@/lib/whatsapp/bot-facts";

export interface BusinessFactsPreview {
  approved: boolean;
  approvedAt: string | null;
  items: { intent: BusinessFactIntent; label: string; text: string | null }[];
}

/**
 * Los datos del negocio que el bot contesta solo, para revisarlos de una vez.
 *
 * Lo que se aprueba son los TEXTOS, no los datos: cambiar el horario en
 * Configuración no pide volver a aprobar, pero cambiar la redacción sí, y eso
 * pasa solo —la aprobación guarda la versión de los textos—.
 */
export function BusinessFactsCard({ data }: { data: BusinessFactsPreview }) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const faltantes = data.items.filter((item) => !item.text);

  const enviar = async (aprobar: boolean) => {
    try {
      setLoading(true);
      const url = `/api/${params.storeId}/bot-facts/approve`;
      if (aprobar) await axios.post(url);
      else await axios.delete(url);
      router.refresh();
      toast({
        description: aprobar
          ? "Listo, el bot ya puede dar los datos del negocio"
          : "Retirado: el bot deja de dar los datos del negocio",
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
          <CardTitle className="text-base">Datos del negocio</CardTitle>
          <Badge variant={data.approved ? "success" : "warning"}>
            {data.approved ? "Aprobados" : "Sin aprobar"}
          </Badge>
        </div>
        <CardDescription>
          Estas seis preguntas las contesta el bot con los datos que tengas
          guardados en Configuración. No salen hasta que las apruebes, y si
          alguna vez cambiamos la redacción vuelven a quedar sin aprobar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li key={item.intent} className="text-sm">
              <p className="font-medium text-muted-foreground">{item.label}</p>
              {item.text ? (
                <p className="mt-1 rounded-md bg-muted/60 p-2">{item.text}</p>
              ) : (
                <p className="mt-1 flex items-center gap-1.5 text-amber-700">
                  <CircleAlert aria-hidden className="h-4 w-4 shrink-0" />
                  Falta el dato en Configuración: por ahora esta pregunta te la
                  paso a ti.
                </p>
              )}
            </li>
          ))}
        </ul>

        {faltantes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Puedes aprobar ya: las que tengan el dato salen, y las {faltantes.length}{" "}
            que faltan te las paso a ti hasta que las llenes.
          </p>
        )}

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
