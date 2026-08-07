"use client";

import axios from "axios";
import { CalendarDays, MapPin, Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type FairEventSummary = {
  id: string;
  name: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: "DRAFT" | "OPEN" | "RECONCILING" | "CLOSED" | "CANCELLED";
  totalAllocated: number;
  totalSold: number;
  salesTotal: number;
};

const statusLabels: Record<FairEventSummary["status"], string> = {
  DRAFT: "Preparación",
  OPEN: "Abierta",
  RECONCILING: "Conciliando",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

const statusVariants: Record<
  FairEventSummary["status"],
  "default" | "secondary" | "success" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  OPEN: "success",
  RECONCILING: "outline",
  CLOSED: "default",
  CANCELLED: "destructive",
};

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || "No fue posible guardar la feria";
  }
  return "No fue posible guardar la feria";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function FairEventsClient({ data }: { data: FairEventSummary[] }) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createFairEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();

    if (name.length < 3) {
      toast({
        title: "Escribe un nombre para la feria",
        description: "Debe tener al menos 3 caracteres.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await axios.post(`/api/${params.storeId}/fair-events`, {
        name,
        location: String(formData.get("location") || "").trim(),
        startsAt: formData.get("startsAt") || undefined,
        endsAt: formData.get("endsAt") || undefined,
        notes: String(formData.get("notes") || "").trim(),
      });
      toast({ title: "Feria creada", variant: "success" });
      router.push(`/${params.storeId}/ferias/${response.data.id}`);
    } catch (error) {
      toast({
        title: "No se pudo crear la feria",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Heading
          title="Ventas en feria"
          description="Reserva el inventario, registra ventas presenciales y concilia al finalizar."
        />
        <Button onClick={() => setIsCreating((value) => !value)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva feria
        </Button>
      </div>
      <Separator />

      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Crear feria</CardTitle>
            <CardDescription>
              Primero reserva los productos que llevarás. Esa cantidad deja de
              estar disponible en la tienda en línea.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={createFairEvent}>
              <div className="grid gap-2">
                <Label htmlFor="fair-name">Nombre de la feria</Label>
                <Input
                  id="fair-name"
                  name="name"
                  placeholder="Ej. Comic Con Medellín"
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="fair-location">Lugar</Label>
                  <Input
                    id="fair-location"
                    name="location"
                    placeholder="Ej. Plaza Mayor"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fair-start">Inicio</Label>
                  <Input id="fair-start" name="startsAt" type="date" />
                </div>
              </div>
              <div className="grid gap-2 sm:max-w-[calc(50%-0.5rem)]">
                <Label htmlFor="fair-end">Finalización</Label>
                <Input id="fair-end" name="endsAt" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fair-notes">Notas</Label>
                <Textarea
                  id="fair-notes"
                  name="notes"
                  placeholder="Información útil para el equipo."
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreating(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creando…" : "Crear y reservar inventario"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ReceiptText className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold">Aún no hay ferias registradas</p>
              <p className="text-sm text-muted-foreground">
                Crea una antes de llevar productos a una venta presencial.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((fair) => (
            <Card key={fair.id} className="flex flex-col">
              <CardHeader className="gap-3 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{fair.name}</CardTitle>
                    {fair.location && (
                      <CardDescription className="mt-2 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {fair.location}
                      </CardDescription>
                    )}
                  </div>
                  <Badge variant={statusVariants[fair.status]}>
                    {statusLabels[fair.status]}
                  </Badge>
                </div>
                {(fair.startsAt || fair.endsAt) && (
                  <CardDescription className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {[formatDate(fair.startsAt), formatDate(fair.endsAt)]
                      .filter(Boolean)
                      .join(" — ")}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="mt-auto grid gap-4">
                <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-center text-sm">
                  <div>
                    <p className="font-semibold">{fair.totalAllocated}</p>
                    <p className="text-xs text-muted-foreground">Asignados</p>
                  </div>
                  <div>
                    <p className="font-semibold">{fair.totalSold}</p>
                    <p className="text-xs text-muted-foreground">Vendidos</p>
                  </div>
                  <div>
                    <p className="font-semibold">
                      {formatCurrency(fair.salesTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">Ventas</p>
                  </div>
                </div>
                <Button asChild className="w-full">
                  <Link href={`/${params.storeId}/ferias/${fair.id}`}>
                    {fair.status === "OPEN" ? "Registrar ventas" : "Ver feria"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
