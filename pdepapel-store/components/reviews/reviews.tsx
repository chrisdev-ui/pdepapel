"use client";

import { SignedIn, SignedOut, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { RefObject, useState } from "react";

import { ReviewItem } from "@/components/reviews/review-item";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NoResults } from "@/components/ui/no-results";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/textarea";
import { KAWAII_FACE_SAD } from "@/constants";
import { Review } from "@/types";

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
  const [rating, setRating] = useState<number>(0);
  const [comments, setComments] = useState<string>("");

  const onSubmit = () => {
    console.log({ rating, comments });
  };

  return (
    <div ref={reviewsRef} className="space-y-4">
      <h3 className="font-serif text-3xl font-bold">{title}</h3>
      {reviews?.length === 0 ? (
        <NoResults
          message={`No hay comentarios sobre este producto ${KAWAII_FACE_SAD}`}
        />
      ) : (
        <ScrollArea className="h-96 w-full">
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
              onChange={(e) => setComments(e.target.value)}
            />
            <Button onClick={onSubmit}>
              Enviar tus comentarios y valoración
            </Button>
          </div>
        </SignedIn>
        <SignedOut>
          <Link href={`/login?redirect_url=${pathname}`}>
            <Button className="my-4">
              Inicia sesión para dejar un comentario
            </Button>
          </Link>
        </SignedOut>
      </div>
    </div>
  );
};
