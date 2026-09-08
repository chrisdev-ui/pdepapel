"use client";

import axios from "axios";
import { Copy, Eye, EyeOff, MessageSquareReply, MessageSquareX, MoreHorizontal, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { REVIEW_REPLY_MAX_LENGTH, type ReviewAction } from "@/lib/review-moderation";

import type { ReviewsColumn } from "./columns";

interface CellActionProps {
  data: ReviewsColumn;
}

/** Menú de una reseña: ocultar o publicar, responder, quitar la respuesta y eliminar. */
export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState(data.reply ?? "");
  const hidden = data.status === "HIDDEN";

  const onCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({ description: "ID de la reseña copiado al portapapeles", variant: "success" });
  };

  const moderate = async (action: ReviewAction, body: Record<string, string> = {}) => {
    try {
      setLoading(true);
      const response = await axios.patch<{ message: string }>(
        `/api/${params.storeId}/${Models.Reviews}/${data.id}`,
        { action, ...body },
      );
      toast({ description: response.data.message, variant: "success" });
      setReplyOpen(false);
      router.refresh();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/${Models.Products}/${data.productId}/${Models.Reviews}/${data.id}`,
      );
      router.refresh();
      toast({ description: "Reseña eliminada", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  return (
    <>
      <AlertModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDelete}
        loading={loading}
        title="¿Eliminar esta reseña?"
        description="Desaparece de la tienda y del panel. Si solo quieres que no se vea, usa «Ocultar»."
      />
      <Dialog open={replyOpen} onOpenChange={(open) => !loading && setReplyOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder a {data.name}</DialogTitle>
            <DialogDescription>
              La respuesta se publica bajo la reseña en la ficha del producto, firmada por la tienda.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <p className="font-semibold text-primary">{data.productName}</p>
            <p className="mt-1 text-muted-foreground">{data.comment || "Sin comentario"}</p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`reply-${data.id}`} className="text-sm font-medium">
              Respuesta de la tienda
            </label>
            <Textarea
              id={`reply-${data.id}`}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              maxLength={REVIEW_REPLY_MAX_LENGTH}
              rows={4}
              placeholder="¡Gracias por tu compra! Nos alegra que…"
              disabled={loading}
            />
            <span className="text-right text-xs text-muted-foreground">
              {reply.length}/{REVIEW_REPLY_MAX_LENGTH}
            </span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReplyOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => moderate("reply", { reply })} disabled={loading || !reply.trim()}>
              {loading ? "Publicando…" : "Publicar respuesta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" disabled={loading}>
            <span className="sr-only">Abrir menú</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              setReply(data.reply ?? "");
              setReplyOpen(true);
            }}
          >
            <MessageSquareReply className="mr-2 h-4 w-4" />
            {data.reply ? "Editar respuesta" : "Responder"}
          </DropdownMenuItem>
          {data.reply && (
            <DropdownMenuItem onClick={() => moderate("clearReply")}>
              <MessageSquareX className="mr-2 h-4 w-4" />
              Quitar respuesta
            </DropdownMenuItem>
          )}
          {hidden ? (
            <DropdownMenuItem onClick={() => moderate("publish")}>
              <Eye className="mr-2 h-4 w-4" />
              Publicar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => moderate("hide")}>
              <EyeOff className="mr-2 h-4 w-4" />
              Ocultar de la tienda
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onCopy(data.id)}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar ID
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive focus:text-destructive">
            <Trash className="mr-2 h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
