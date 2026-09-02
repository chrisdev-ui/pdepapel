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
    <div
      ref={ref}
      className="z-10 min-h-[13rem] w-full sm:min-h-[6.25rem] lg:max-w-xl"
    >
      {inView ? (
        <NewsletterForm />
      ) : (
        <div
          aria-hidden="true"
          className="min-h-[13rem] w-full sm:min-h-[6.25rem]"
        >
          <div className="h-24 w-full animate-pulse rounded bg-white/60 sm:h-11" />
          <div className="mt-3 h-20 w-full animate-pulse rounded bg-white/40 sm:h-11" />
        </div>
      )}
    </div>
  );
}
