import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  id: number;
  name: string;
  description: string;
}

interface MultiStepFormProps {
  steps: Step[];
  currentStep: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * Stepper + step content. Numbered circles instead of illustrations: the
 * progress reads at a glance on a phone and needs no seasonal assets.
 */
export const MultiStepForm = ({
  steps,
  currentStep,
  children,
  className,
}: MultiStepFormProps) => {
  const progress =
    steps.length > 1 ? ((currentStep - 1) / (steps.length - 1)) * 100 : 0;

  return (
    <div className={cn("w-full", className)}>
      <ol
        className="relative mb-6 flex items-start justify-between gap-2 px-2 sm:mb-8 sm:px-6"
        aria-label={`Paso ${currentStep} de ${steps.length}`}
      >
        {/* Rail: from the centre of the first circle to the centre of the last. */}
        <div
          aria-hidden="true"
          className="absolute left-[calc(8px+20px)] right-[calc(8px+20px)] top-5 h-1 overflow-hidden rounded-full bg-border sm:left-[calc(24px+22px)] sm:right-[calc(24px+22px)]"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-pink-froly to-pink-froly transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isActive = currentStep === stepNumber;
          const isComplete = currentStep > stepNumber;

          return (
            <li
              key={step.id}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "relative z-10 flex flex-1 flex-col items-center gap-2 text-center",
                index === 0 && "items-start text-left",
                index === steps.length - 1 && "items-end text-right",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-background font-quicksand text-sm font-bold transition-[background-color,border-color,box-shadow] duration-300 sm:h-11 sm:w-11",
                  isActive &&
                    "border-primary bg-primary text-primary-foreground shadow-[0_0_0_6px_hsl(var(--froly)/0.25)]",
                  isComplete &&
                    "border-pink-froly bg-pink-froly text-white",
                  !isActive && !isComplete && "border-border text-muted-foreground",
                )}
              >
                {isComplete ? (
                  <>
                    <Check className="h-5 w-5 stroke-[3]" aria-hidden="true" />
                    <span className="sr-only">Completado</span>
                  </>
                ) : (
                  stepNumber
                )}
              </span>
              <span className="flex flex-col">
                <span
                  className={cn(
                    "text-xs font-semibold sm:text-sm",
                    isActive || isComplete
                      ? "text-blue-yankees"
                      : "text-muted-foreground",
                  )}
                >
                  {step.name}
                </span>
                {step.description && (
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {step.description}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <div>{children}</div>
    </div>
  );
};
