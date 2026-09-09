"use client";

import { SignedIn, SignedOut, useAuth } from "@clerk/nextjs";
import axios from "axios";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { env } from "@/lib/env.mjs";
import { accountAccessPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { Review } from "@/types";

interface ReviewFormProps {
  productId: string;
  reviews: Review[];
}

/** Publica o actualiza la reseña de la clienta con sesión; pasa por moderación. */
export function ReviewForm({ productId, reviews }: ReviewFormProps) {
  const { userId, getToken } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSending, setIsSending] = useState(false);
  const existing = reviews.find((review) => review.userId === userId);

  const submit = async () => {
    if (rating < 1) {
      toast({ description: "Elige una calificación de 1 a 5 estrellas.", variant: "warning" });
      return;
    }
    try {
      setIsSending(true);
      const sessionToken = await getToken();
      if (!sessionToken) throw new Error("Sin sesión");
      const config = { headers: { Authorization: `Bearer ${sessionToken}` } };
      const base = `${env.NEXT_PUBLIC_API_URL}/products/${productId}/reviews`;
      if (existing) {
        await axios.patch(`${base}/${existing.id}`, { rating, comment }, config);
      } else {
        await axios.post(base, { rating, comment }, config);
      }
      setRating(0);
      setComment("");
      toast({ title: "¡Gracias por tu reseña!", description: "La revisamos y la publicamos en poco tiempo.", variant: "success" });
      router.refresh();
    } catch (error) {
      console.error("[REVIEW_ERROR]", error);
      toast({ title: "No pudimos enviar tu reseña", description: "Inténtalo de nuevo en unos minutos.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" id="escribir-resena">
      <SignedIn>
        <p className="font-sans text-sm font-semibold text-blue-yankees">{existing ? "Actualiza tu reseña" : "Escribe tu reseña"}</p>
        <fieldset>
          <legend className="mb-1.5 font-sans text-sm text-gray-600">Tu calificación</legend>
          <StarRating currentRating={rating} onRatingChange={setRating} />
        </fieldset>
        <label htmlFor="review-comment" className="sr-only">
          Comentario
        </label>
        <Textarea
          id="review-comment"
          placeholder="Cuéntanos qué te pareció"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="min-h-24"
        />
        <Button onClick={submit} disabled={isSending} className="self-start rounded-full bg-blue-yankees font-sans font-semibold">
          {isSending ? "Enviando…" : existing ? "Guardar cambios" : "Publicar reseña"}
        </Button>
        <p className="font-sans text-xs text-gray-500">Tu reseña pasa por moderación antes de publicarse.</p>
      </SignedIn>
      <SignedOut>
        <p className="font-sans text-sm text-gray-600">Solo clientas con sesión pueden opinar.</p>
        <Button asChild variant="outline" className="self-start rounded-full border-2 border-blue-yankees font-sans font-semibold text-blue-yankees">
          <Link href={accountAccessPath(STOREFRONT_ROUTES.signIn, pathname)}>Inicia sesión para escribir una reseña</Link>
        </Button>
      </SignedOut>
    </div>
  );
}
