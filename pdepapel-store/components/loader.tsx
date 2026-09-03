import Image from "next/image";

import { cn } from "@/lib/utils";

interface LoaderProps {
  label?: string;
  className?: string;
}

/**
 * Branded full-area loading state.
 *
 * Reserves its own vertical space (at least half the viewport, or the full
 * height of a sized parent), so it never collapses between the fixed header
 * and the footer. The label lives in normal flow instead of an absolute
 * offset, so it cannot overlap siblings.
 */
export const Loader: React.FC<LoaderProps> = ({ label, className }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-6 px-4 py-16",
        className,
      )}
    >
      <div className="relative flex h-32 w-32 items-center justify-center">
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-full border-b-4 border-t-4 border-pink-froly motion-reduce:animate-none"
        />
        <Image
          src="/images/no-text-transparent-bg.webp"
          width={112}
          height={112}
          alt=""
          sizes="112px"
          className="h-28 w-28 rounded-full"
          unoptimized
        />
      </div>
      <p className="text-center font-medium text-blue-yankees">
        {label ?? "Cargando"}
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block animate-dot-pulse font-mono text-xl font-bold motion-reduce:animate-none"
        >
          .
        </span>
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block animate-dot-pulse font-mono text-xl font-bold delay-300 motion-reduce:animate-none"
        >
          .
        </span>
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block animate-dot-pulse font-mono text-xl font-bold delay-700 motion-reduce:animate-none"
        >
          .
        </span>
      </p>
    </div>
  );
};
