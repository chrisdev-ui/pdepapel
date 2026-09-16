import { Skeleton } from "@/components/ui/skeleton";

import { FORM_STEPS } from "./checkout-steps";
import { MultiStepForm } from "./multi-step-form";

/**
 * Mirrors the real step-1 tree box for box. Both the route-level loading UI and
 * the pre-hydration branch of the form render this, so the customer sees one
 * shape from first paint until the form is live instead of three different ones.
 */
export const CheckoutSkeleton = ({ isGuest = true }: { isGuest?: boolean }) => (
  <div
    className="mt-4 space-y-6 lg:mt-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8 lg:space-y-0"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="sr-only">Cargando formulario de compra</span>

    <div className="space-y-4 lg:col-span-8">
      {/* Same box as the collapsed <details> summary on phones. */}
      <div className="rounded-xl border border-blue-baby/60 bg-blue-purple/10 lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>

      <div className="rounded-xl border border-blue-baby/60 bg-card p-4 shadow-[20px_20px_30px_rgba(0,0,0,0.02)] sm:p-6">
        {/* The real stepper, frozen on step 1: identical geometry by construction. */}
        <MultiStepForm steps={FORM_STEPS} currentStep={1}>
          <div className="space-y-6">
            <div className="relative min-h-[300px]">
              <div className="space-y-6">
                <div className="space-y-1">
                  <Skeleton className="h-8 w-40 sm:h-9" />
                  <Skeleton className="h-5 w-full max-w-sm" />
                </div>

                {isGuest && <Skeleton className="h-[68px] w-full rounded-xl" />}

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-11 w-full" />
                      <Skeleton className="h-5 w-40" />
                    </div>
                  ))}
                </div>

                <div className="flex items-start gap-2.5">
                  <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded" />
                  <Skeleton className="h-5 w-3/4" />
                </div>

                <Skeleton className="h-4 w-56" />
              </div>
            </div>

            {/* Step 1 has no «back», so only the forward button is reserved. */}
            <div className="flex flex-col gap-3 border-t pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <Skeleton className="h-12 w-full rounded-full sm:ml-auto sm:w-56" />
              </div>
            </div>
          </div>
        </MultiStepForm>
      </div>
    </div>

    <div className="hidden rounded-xl border border-blue-baby/60 bg-card p-5 shadow-[20px_20px_30px_rgba(0,0,0,0.02)] lg:col-span-4 lg:block">
      <div className="space-y-4">
        <Skeleton className="h-7 w-40" />
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
    </div>
  </div>
);
