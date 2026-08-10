"use client";

import dynamic from "next/dynamic";
import { useInView } from "react-intersection-observer";

const NewsletterForm = dynamic(
  () =>
    import("@/components/newsletter-form").then(
      (module) => module.NewsletterForm,
    ),
  { ssr: false },
);

export function DeferredNewsletterForm() {
  const { ref, inView } = useInView({
    rootMargin: "300px",
    triggerOnce: true,
  });

  return (
    <div ref={ref} className="min-h-10 z-10 w-full sm:w-80">
      {inView ? (
        <NewsletterForm />
      ) : (
        <div className="h-10 w-full animate-pulse rounded bg-white/60" />
      )}
    </div>
  );
}
