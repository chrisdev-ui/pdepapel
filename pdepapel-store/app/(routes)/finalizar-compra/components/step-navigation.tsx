import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Loader2, Lock } from "lucide-react";
import { forwardRef } from "react";

interface StepNavigationProps {
  currentStep: number;
  totalSteps: number;
  onNext?: () => void;
  onBack?: () => void;
  isNextDisabled?: boolean;
  isLoading?: boolean;
  /** Label for the submit button on the last step. */
  submitLabel?: string;
  /** Label shown while the order is being created. */
  loadingLabel?: string;
  nextLabel?: string;
  backLabel?: string;
  className?: string;
  /** Small print under the buttons (terms, what happens next). */
  footnote?: React.ReactNode;
}

export const NEXT_STEP_LABELS: Record<number, string> = {
  1: "Continuar a entrega",
  2: "Continuar al pago",
};

export const StepNavigation = forwardRef<HTMLDivElement, StepNavigationProps>(
  (
    {
      currentStep,
      totalSteps,
      onNext,
      onBack,
      isNextDisabled,
      isLoading,
      submitLabel = "Confirmar pedido",
      loadingLabel = "Creando tu pedido…",
      nextLabel,
      backLabel,
      className,
      footnote,
    },
    ref,
  ) => {
    const isFirstStep = currentStep === 1;
    const isLastStep = currentStep === totalSteps;

    const getNextLabel = () => {
      if (nextLabel) return nextLabel;
      if (isLastStep) return submitLabel;
      return NEXT_STEP_LABELS[currentStep] ?? "Siguiente";
    };

    return (
      <div
        ref={ref}
        className={cn("flex flex-col gap-3 border-t pt-5", className)}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {!isFirstStep && (
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isLoading}
              className="group h-11 w-full rounded-full border-primary/20 bg-primary/5 px-6 text-base transition-[background-color,border-color] duration-300 hover:border-primary/50 hover:bg-primary/10 sm:w-auto"
            >
              <ArrowLeft
                aria-hidden="true"
                className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1 motion-reduce:transform-none"
              />
              {backLabel ?? "Atrás"}
            </Button>
          )}

          <Button
            type={isLastStep ? "submit" : "button"}
            onClick={(e) => {
              if (!isLastStep) {
                e.preventDefault();
                onNext?.();
              }
            }}
            disabled={isNextDisabled || isLoading}
            aria-busy={isLoading || undefined}
            className="group relative h-12 w-full overflow-hidden rounded-full bg-primary px-7 text-base font-semibold shadow-lg transition-[transform,box-shadow,background-color] duration-300 hover:scale-[1.02] hover:shadow-primary/40 motion-reduce:transform-none sm:ml-auto sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2
                  aria-hidden="true"
                  className="mr-2 h-4 w-4 animate-spin"
                />
                {isLastStep ? loadingLabel : "Validando…"}
              </>
            ) : (
              <>
                {isLastStep && (
                  <Lock aria-hidden="true" className="mr-2 h-4 w-4" />
                )}
                {getNextLabel()}
                {!isLastStep && (
                  <ArrowRight
                    aria-hidden="true"
                    className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
                  />
                )}
              </>
            )}
          </Button>
        </div>
        {footnote ? (
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-right">
            {footnote}
          </p>
        ) : null}
      </div>
    );
  },
);
StepNavigation.displayName = "StepNavigation";
