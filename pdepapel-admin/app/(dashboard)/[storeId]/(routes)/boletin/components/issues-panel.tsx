"use client";

import { NewsletterIssueStatus } from "@prisma/client";
import axios from "axios";
import {
  ExternalLink,
  Images,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import { TintBadge } from "@/components/ui/tint-badge";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { MAX_ISSUE_PAGES } from "@/lib/newsletter-issues-shared";

export interface IssuePage {
  id: string;
  imageUrl: string;
  alt: string | null;
  position: number;
}

export interface Issue {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  coverUrl: string;
  coverAlt: string | null;
  status: NewsletterIssueStatus;
  sentAt: string | null;
  recipients: number | null;
  createdAt: string;
  pages: IssuePage[];
}

const DATE = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeZone: "America/Bogota",
});

interface IssuesPanelProps {
  storeId: string;
  storefrontUrl: string;
  /** Cuántas recibirían el envío ahora mismo. La cifra va en la confirmación. */
  recipientCount: number;
}

export function IssuesPanel({
  storeId,
  storefrontUrl,
  recipientCount,
}: IssuesPanelProps) {
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [cover, setCover] = useState<string[]>([]);
  const [pages, setPages] = useState<string[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.get<Issue[]>(
        `/api/${storeId}/newsletter/issues`,
      );
      setIssues(data);
    } catch (error) {
      toast({ variant: "destructive", description: getErrorMessage(error) });
    } finally {
      setIsLoading(false);
    }
  }, [storeId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setTitle("");
    setIntro("");
    setCover([]);
    setPages([]);
    setIsOpen(true);
  };

  const openEdit = (issue: Issue) => {
    setEditing(issue);
    setTitle(issue.title);
    setIntro(issue.intro ?? "");
    setCover([issue.coverUrl]);
    setPages(issue.pages.map((page) => page.imageUrl));
    setIsOpen(true);
  };

  const save = async () => {
    if (!cover[0]) {
      toast({ variant: "destructive", description: "Sube la portada del número" });
      return;
    }
    if (pages.length === 0) {
      toast({
        variant: "destructive",
        description: "Sube al menos una página",
      });
      return;
    }
    setIsSaving(true);
    try {
      const body = {
        title,
        intro,
        coverUrl: cover[0],
        pages: pages.map((imageUrl) => ({ imageUrl })),
      };
      if (editing) {
        await axios.patch(
          `/api/${storeId}/newsletter/issues/${editing.id}`,
          body,
        );
      } else {
        await axios.post(`/api/${storeId}/newsletter/issues`, body);
      }
      setIsOpen(false);
      await load();
      toast({
        variant: "success",
        description: editing ? "Número actualizado" : "Número guardado",
      });
    } catch (error) {
      toast({ variant: "destructive", description: getErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * El envío pide confirmación con la cifra delante.
   *
   * Un correo enviado no se recoge, y es el único botón de esta pantalla que
   * le habla a personas de verdad. Mismo patrón que «Reactivar a Todos».
   */
  const send = async (issue: Issue) => {
    if (recipientCount === 0) {
      toast({
        variant: "destructive",
        description: "Todavía no hay suscriptoras confirmadas a quienes enviar",
      });
      return;
    }
    const ok = await requestConfirmation({
      title: "¿Enviar este número?",
      description: `Se enviará «${issue.title}» a ${recipientCount} suscriptora${recipientCount === 1 ? "" : "s"} confirmada${recipientCount === 1 ? "" : "s"} ahora mismo. No se puede deshacer, y el número no se podrá volver a editar.`,
      confirmLabel: `Sí, enviar a ${recipientCount}`,
    });
    if (!ok) return;

    setSendingId(issue.id);
    try {
      const { data } = await axios.post<{ message: string }>(
        `/api/${storeId}/newsletter/issues/${issue.id}/send`,
      );
      toast({ variant: "success", description: data.message });
      await load();
    } catch (error) {
      toast({ variant: "destructive", description: getErrorMessage(error) });
    } finally {
      setSendingId(null);
    }
  };

  const remove = async (issue: Issue) => {
    const ok = await requestConfirmation({
      title: "¿Eliminar el borrador?",
      description: `Se eliminará «${issue.title}» y sus ${issue.pages.length} página${issue.pages.length === 1 ? "" : "s"}. Las imágenes seguirán en Cloudinary.`,
      confirmLabel: "Eliminar borrador",
      destructive: true,
    });
    if (!ok) return;
    try {
      await axios.delete(`/api/${storeId}/newsletter/issues/${issue.id}`);
      await load();
      toast({ variant: "success", description: "Borrador eliminado" });
    } catch (error) {
      toast({ variant: "destructive", description: getErrorMessage(error) });
    }
  };

  return (
    <SectionCard
      id="numeros-boletin"
      title="Números del boletín"
      description="Sube las páginas que exportaste de Canva como imágenes. La portada se ve dentro del correo y las páginas se publican en la tienda."
      action={
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Nuevo número
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando números…</p>
      ) : !issues || issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay ningún número. Crea el primero: una portada, las
          páginas y un texto corto.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {issues.map((issue) => {
            const isSent = issue.status === NewsletterIssueStatus.SENT;
            return (
              <li
                key={issue.id}
                className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={issue.coverUrl}
                  alt=""
                  className="h-20 w-16 shrink-0 rounded-lg border object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-primary">
                      {issue.title}
                    </span>
                    <TintBadge
                      tone={isSent ? "mint" : "cream"}
                      label={isSent ? "Enviado" : "Borrador"}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {issue.pages.length}{" "}
                    {issue.pages.length === 1 ? "página" : "páginas"}
                    {isSent && issue.sentAt
                      ? ` · enviado el ${DATE.format(new Date(issue.sentAt))} a ${issue.recipients ?? 0} ${issue.recipients === 1 ? "persona" : "personas"}`
                      : ""}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {isSent ? (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`${storefrontUrl}/boletin/${issue.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink
                          className="mr-2 h-4 w-4"
                          aria-hidden="true"
                        />
                        Ver en la tienda
                      </a>
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(issue)}
                      >
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar ${issue.title}`}
                        onClick={() => void remove(issue)}
                      >
                        <Trash2
                          className="h-4 w-4 text-destructive"
                          aria-hidden="true"
                        />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void send(issue)}
                        disabled={sendingId === issue.id}
                      >
                        {sendingId === issue.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        Enviar a {recipientCount}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar número" : "Nuevo número"}
            </DialogTitle>
            <DialogDescription>
              Exporta las páginas desde Canva como JPG. El panel las reduce sola
              a 2000 px, así que no hace falta que las prepares.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="issue-title">Título del número</Label>
              <Input
                id="issue-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej. Regreso a clases · noviembre"
                maxLength={160}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issue-intro">Presentación (opcional)</Label>
              <Textarea
                id="issue-intro"
                value={intro}
                onChange={(event) => setIntro(event.target.value)}
                placeholder="Dos líneas contando qué trae este número."
                maxLength={600}
              />
            </div>
            <div className="grid gap-2">
              <Label>Portada</Label>
              <p className="text-xs text-muted-foreground">
                Es la imagen que se ve dentro del correo.
              </p>
              <ImageUpload
                value={cover.map((url) => ({ url }))}
                disabled={isSaving}
                maxImages={1}
                onChange={(images) => setCover(images.map((image) => image.url))}
                onRemove={() => setCover([])}
              />
            </div>
            <div className="grid gap-2">
              <Label>Páginas</Label>
              <p className="text-xs text-muted-foreground">
                En orden. Hasta {MAX_ISSUE_PAGES} por número.
              </p>
              <ImageUpload
                value={pages.map((url) => ({ url }))}
                disabled={isSaving}
                maxImages={MAX_ISSUE_PAGES}
                onChange={(images) => setPages(images.map((image) => image.url))}
                onRemove={(url) =>
                  setPages((current) => current.filter((item) => item !== url))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Images className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Guardar borrador
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </SectionCard>
  );
}
