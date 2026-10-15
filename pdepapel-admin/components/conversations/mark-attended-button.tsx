"use client";

import axios from "axios";
import { CheckCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

/** «Marcar como atendido»: saca la conversación de «Esperando a Paula» sin escribirle a la clienta. */
export function MarkAttendedButton({
  conversationId,
  compact = false,
  className,
}: {
  conversationId: string;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const storeId = String(useParams().storeId);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const markAttended = async () => {
    try {
      setLoading(true);
      await axios.post(`/api/${storeId}/conversations/attended`, { ids: [conversationId] });
      router.refresh();
      toast({
        title: "Marcada como atendida",
        description: "No se le envió nada a la clienta. Si vuelve a escribir, aparece otra vez.",
        variant: "success",
      });
    } catch (error) {
      toast({ title: "No se pudo marcar como atendida", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={loading}
      className={cn("min-h-11 sm:min-h-9", className)}
      aria-label={compact ? "Marcar como atendido" : undefined}
      title="Ya la atendiste por otro lado: sale de «Esperando a Paula» sin mandarle nada."
      onClick={(event) => {
        event.stopPropagation();
        void markAttended();
      }}
    >
      <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
      {compact ? "Atendido" : "Marcar como atendido"}
    </Button>
  );
}
