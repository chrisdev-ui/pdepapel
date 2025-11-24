import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

interface StepNavigationProps {
  currentStep: number;
  totalSteps: number;
  onNext?: () => void;
  onBack?: () => void;
  isNextDisabled?: boolean;
  isLoading?: boolean;
  nextLabel?: string;
  backLabel?: string;
  className?: string;
}

export const StepNavigation = ({
  currentStep,
  totalSteps,
  onNext,
  onBack,
  isNextDisabled,
  isLoading,
  nextLabel,
  backLabel,
  className,
}: StepNavigationProps) => {
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;

  const getNextLabel = () => {
    if (nextLabel) return nextLabel;
    if (isLastStep) return "Finalizar compra";
    return "Siguiente";
  };

  const getBackLabel = () => {
    if (backLabel) return backLabel;
    return "Atrás";
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      {/* Back Button */}
      {!isFirstStep && (
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isLoading}
          className="hover:bg-primary/15 group h-10 w-full border-primary/20 bg-primary/5 px-6 text-base backdrop-blur-md transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/20 sm:w-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
          {getBackLabel()}
        </Button>
      )}

      {/* Next/Submit Button */}
      <Button
        type={isLastStep ? "submit" : "button"}
        onClick={(e) => {
          if (!isLastStep) {
            e.preventDefault();
            onNext?.();
          }
        }}
        disabled={isNextDisabled || isLoading}
        className={cn(
          "group relative h-10 overflow-hidden bg-primary px-6 text-base shadow-lg transition-all duration-500 hover:scale-[1.03] hover:shadow-primary/50 sm:ml-auto",
          {
            "w-full": true,
            "sm:w-auto": !isFirstStep,
          },
        )}
      >
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Procesando...
          </>
        ) : (
          <>
            {getNextLabel()}
            {!isLastStep && (
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            )}
          </>
        )}
      </Button>
    </div>
  );
};
