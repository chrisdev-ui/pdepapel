"use client";

import { NewsletterSubscriberStatus } from "@prisma/client";
import axios from "axios";
import {
  Download,
  Loader2,
  MailCheck,
  MailQuestion,
  Search,
  UserMinus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";

import type { NewsletterSubscriberRow } from "../server/get-newsletter-subscribers";

const STATUS_COPY: Record<
  NewsletterSubscriberStatus,
  {
    label: string;
    variant: "success" | "warning" | "secondary" | "destructive";
  }
> = {
  ACTIVE: { label: "Confirmada", variant: "success" },
  PENDING: { label: "Por confirmar", variant: "warning" },
  UNSUBSCRIBED: { label: "Cancelada", variant: "secondary" },
  SUPPRESSED: { label: "Bloqueada", variant: "destructive" },
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

interface NewsletterSubscribersClientProps {
  storeId: string;
  subscribers: NewsletterSubscriberRow[];
  counts: Record<NewsletterSubscriberStatus, number>;
  total: number;
}

export function NewsletterSubscribersClient({
  storeId,
  subscribers,
  counts,
  total,
}: NewsletterSubscribersClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<NewsletterSubscriberStatus | "ALL">(
    "ALL",
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [unsubscribeTarget, setUnsubscribeTarget] =
    useState<NewsletterSubscriberRow | null>(null);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-CO");
    return subscribers.filter((subscriber) => {
      const matchesStatus = status === "ALL" || subscriber.status === status;
      const matchesQuery =
        !normalizedQuery ||
        subscriber.email.toLocaleLowerCase("es-CO").includes(normalizedQuery) ||
        subscriber.source?.toLocaleLowerCase("es-CO").includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [query, status, subscribers]);

  const runAction = async (
    subscriber: NewsletterSubscriberRow,
    action: "resend_confirmation" | "unsubscribe",
  ) => {
    try {
      setBusyId(subscriber.id);
      await axios.patch(
        `/api/${storeId}/newsletter/subscribers/${subscriber.id}`,
        { action },
      );
      toast({
        variant: "success",
        description:
          action === "unsubscribe"
            ? "La suscripción quedó cancelada."
            : "Enviamos una nueva confirmación.",
      });
      setUnsubscribeTarget(null);
      router.refresh();
    } catch (error) {
      toast({ variant: "destructive", description: getErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <Heading
          title="Boletín y suscriptores"
          description="Aquí aparecen únicamente las personas que solicitaron novedades. Solo las confirmadas se pueden exportar para comunicaciones de marketing."
        />
        <Button asChild variant="outline">
          <a href={`/api/${storeId}/newsletter/export`}>
            <Download className="mr-2 h-4 w-4" />
            Exportar confirmados
          </a>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total registrados"
          value={total}
          icon={<MailQuestion />}
        />
        <MetricCard
          title="Confirmados"
          value={counts.ACTIVE}
          icon={<MailCheck />}
        />
        <MetricCard
          title="Por confirmar"
          value={counts.PENDING}
          icon={<MailQuestion />}
        />
        <MetricCard
          title="Cancelados o bloqueados"
          value={counts.UNSUBSCRIBED + counts.SUPPRESSED}
          icon={<UserMinus />}
        />
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Suscriptores</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              La confirmación por correo evita direcciones falsas y protege la
              reputación de envío.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por correo u origen"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as typeof status)}
            >
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los estados</SelectItem>
                <SelectItem value="ACTIVE">Confirmados</SelectItem>
                <SelectItem value="PENDING">Por confirmar</SelectItem>
                <SelectItem value="UNSUBSCRIBED">Cancelados</SelectItem>
                <SelectItem value="SUPPRESSED">Bloqueados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Correo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Solicitud</TableHead>
                  <TableHead>Confirmación</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((subscriber) => (
                  <TableRow key={subscriber.id}>
                    <TableCell className="font-medium">
                      {subscriber.email}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={subscriber.status} />
                    </TableCell>
                    <TableCell>{subscriber.source ?? "/"}</TableCell>
                    <TableCell>{formatDate(subscriber.consentedAt)}</TableCell>
                    <TableCell>{formatDate(subscriber.confirmedAt)}</TableCell>
                    <TableCell className="text-right">
                      <SubscriberAction
                        subscriber={subscriber}
                        busy={busyId === subscriber.id}
                        onResend={() =>
                          runAction(subscriber, "resend_confirmation")
                        }
                        onUnsubscribe={() => setUnsubscribeTarget(subscriber)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((subscriber) => (
              <div key={subscriber.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-all font-medium">
                    {subscriber.email}
                  </p>
                  <StatusBadge status={subscriber.status} />
                </div>
                <Separator className="my-3" />
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Origen</dt>
                  <dd>{subscriber.source ?? "/"}</dd>
                  <dt className="text-muted-foreground">Solicitud</dt>
                  <dd>{formatDate(subscriber.consentedAt)}</dd>
                  <dt className="text-muted-foreground">Confirmación</dt>
                  <dd>{formatDate(subscriber.confirmedAt)}</dd>
                </dl>
                <div className="mt-4">
                  <SubscriberAction
                    subscriber={subscriber}
                    busy={busyId === subscriber.id}
                    onResend={() =>
                      runAction(subscriber, "resend_confirmation")
                    }
                    onUnsubscribe={() => setUnsubscribeTarget(subscriber)}
                  />
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No hay suscriptores que coincidan con los filtros.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(unsubscribeTarget)}
        onOpenChange={(open) => !open && setUnsubscribeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta suscripción?</AlertDialogTitle>
            <AlertDialogDescription>
              {unsubscribeTarget?.email} dejará de aparecer en la exportación de
              correos confirmados. Para volver, esa persona deberá confirmar
              nuevamente desde la tienda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!unsubscribeTarget || Boolean(busyId)}
              onClick={() =>
                unsubscribeTarget && runAction(unsubscribeTarget, "unsubscribe")
              }
            >
              {busyId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Cancelar suscripción
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: NewsletterSubscriberStatus }) {
  const copy = STATUS_COPY[status];
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

function SubscriberAction({
  subscriber,
  busy,
  onResend,
  onUnsubscribe,
}: {
  subscriber: NewsletterSubscriberRow;
  busy: boolean;
  onResend: () => void;
  onUnsubscribe: () => void;
}) {
  if (subscriber.status === NewsletterSubscriberStatus.SUPPRESSED) {
    return (
      <span className="text-xs text-muted-foreground">
        Sin acciones disponibles
      </span>
    );
  }
  if (subscriber.status === NewsletterSubscriberStatus.ACTIVE) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={onUnsubscribe}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UserMinus className="mr-2 h-4 w-4" />
        )}
        Dar de baja
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={onResend}>
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <MailCheck className="mr-2 h-4 w-4" />
      )}
      Reenviar confirmación
    </Button>
  );
}
