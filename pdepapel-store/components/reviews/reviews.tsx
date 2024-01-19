"use client";

import { SignedIn, SignedOut, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { RefObject, useState } from "react";

import { ReviewItem } from "@/components/reviews/review-item";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NoResults } from "@/components/ui/no-results";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/textarea";
import { KAWAII_FACE_SAD } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { env } from "@/lib/env.mjs";
import { Review } from "@/types";
import axios from "axios";

interface ReviewsProps {
  title: string;
  reviews: Review[];
  reviewsRef: RefObject<HTMLDivElement>;
}

export const Reviews: React.FC<ReviewsProps> = ({
  title,
  reviews = [],
  reviewsRef,
}) => {
  const params = useParams();
  const { userId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [rating, setRating] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [comments, setComments] = useState<string>("");

  const onSubmit = async () => {
    try {
      setIsLoading(true);
      const existentReview = reviews.find((review) => review.userId === userId);
      if (existentReview) {
        await axios.patch(
          `${env.NEXT_PUBLIC_API_URL}/products/${params.productId}/reviews/${existentReview.id}`,
          {
            rating,
            comment: comments,
            userId,
          },
        );
      } else {
        await axios.post(
          `${env.NEXT_PUBLIC_API_URL}/products/${params.productId}/reviews`,
          {
            rating,
            comment: comments,
            userId,
          },
        );
      }
      setRating(0);
      setComments("");
      toast({
        title: "Comentario enviado",
        variant: "success",
        description: "Tu comentario ha sido enviado correctamente",
      });
    } catch (error) {
      console.log("[REVIEW_ERROR]", error);
      toast({
        title: "Error al enviar el comentario",
        variant: "destructive",
        description: "Ha ocurrido un error al enviar tu comentario",
      });
    } finally {
      setIsLoading(false);
      router.refresh();
    }
  };

  return (
    <div ref={reviewsRef} className="space-y-4">
      <h3 className="font-serif text-3xl font-bold">{title}</h3>
      {reviews?.length === 0 ? (
        <NoResults
          message={`No hay comentarios sobre este producto ${KAWAII_FACE_SAD}`}
        />
      ) : (
        <ScrollArea className="max-h-96 w-full">
          {reviews?.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </ScrollArea>
      )}
      <div className="flex w-full flex-col items-start py-4">
        <h3 className="font-serif font-semibold">
          Deja tu comentario y tu valoración.
        </h3>
        <SignedIn>
          <div className="flex w-full flex-col items-start gap-5">
            <Label htmlFor="message"></Label>
            <StarRating
              currentRating={rating}
              onRatingChange={(value: number) => setRating(value)}
            />
            <Textarea
              id="message"
              placeholder="Escribe tu comentario"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
            <Button onClick={onSubmit} disabled={isLoading}>
              Enviar tus comentarios y valoración
            </Button>
          </div>
        </SignedIn>
        <SignedOut>
          <Link href={`/sign-in?redirect_url=${pathname}`}>
            <Button className="my-4">
              Inicia sesión para dejar un comentario
            </Button>
          </Link>
        </SignedOut>
      </div>
    </div>
  );
};
