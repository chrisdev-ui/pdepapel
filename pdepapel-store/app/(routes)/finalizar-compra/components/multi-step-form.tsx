import { SEASON_CONFIG } from "@/constants";
import { cn } from "@/lib/utils";
import { Season } from "@/types";
import { Check } from "lucide-react";
import Image from "next/image";

interface Step {
  id: number;
  name: string;
  description: string;
  logo: string;
}

interface MultiStepFormProps {
  steps: Step[];
  currentStep: number;
  children: React.ReactNode;
  className?: string;
  season?: Season;
}

export const MultiStepForm = ({
  steps,
  currentStep,
  children,
  className,
  season = Season.Default,
}: MultiStepFormProps) => {
  const seasonConfig = SEASON_CONFIG[season];

  return (
    <div className={cn("w-full", className)}>
      {/* {Stepper} */}
      <div className="mb-6 sm:mb-8">
        <div className="relative flex flex-col items-start gap-4 px-2 xs:flex-row xs:items-start xs:justify-between sm:px-4">
          {/* Progress Line with Glow - Vertical on mobile, Horizontal on xxs+ */}
          <div className="absolute left-4 top-0 h-full w-0.5 overflow-hidden rounded-full bg-border xs:left-0 xs:top-5 xs:h-1 xs:w-full">
            <div
              className="relative h-full bg-gradient-to-b from-primary via-pink-froly to-primary transition-all duration-700 ease-out xs:bg-gradient-to-r"
              style={{
                height: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
                width: "100%",
              }}
            >
              <style jsx>{`
                @media (min-width: 375px) {
                  div {
                    height: 100% !important;
                    width: ${((currentStep - 1) / (steps.length - 1)) *
                    100}% !important;
                  }
                }
              `}</style>
              <div
                className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent"
                style={{ backgroundSize: "1000px 100%" }}
              />
            </div>
          </div>

          {/* Steps */}
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const isActive = currentStep === stepNumber;
            const isComplete = currentStep > stepNumber;

            const logoSrc = step.logo.replace(
              ".webp",
              `${seasonConfig.checkoutSuffix || ""}.webp`,
            );

            return (
              <div
                key={step.id}
                className="relative flex items-center gap-3 xs:flex-col"
              >
                {/* Step Circle with Glow */}
                <div
                  className={cn(
                    "group relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-500 s:h-10 s:w-10 sm:h-12 sm:w-12",
                    {
                      "scale-110 animate-pulse-glow text-primary shadow-lg":
                        isActive,
                      "scale-105 border-success text-primary shadow-lg":
                        isComplete,
                      "bg-card/50 text-muted-foreground backdrop-blur-sm hover:scale-105 hover:border-pink-froly/50":
                        !isActive && !isComplete,
                    },
                  )}
                >
                  {isComplete ? (
                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                      {/* Logo as background with opacity and blur */}
                      <Image
                        src={`/images/${logoSrc}`}
                        alt={step.name}
                        fill
                        className="z-50 opacity-30 blur-[0.5px] duration-300 animate-in zoom-in"
                      />
                      {/* Success check icon in the center */}
                      <div className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-pink-froly/90 shadow-lg s:h-8 s:w-8">
                        <Check className="h-4 w-4 stroke-[3] text-white duration-300 animate-in zoom-in s:h-5 s:w-5" />
                      </div>
                    </div>
                  ) : (
                    <Image
                      src={`/images/${logoSrc}`}
                      alt={step.name}
                      fill
                      className="duration-300 animate-in zoom-in"
                    />
                  )}
                  {isActive && (
                    <div className="absolute inset-0 animate-ping rounded-full bg-pink-froly/10" />
                  )}
                </div>

                {/* Step Label */}
                <div className="flex-1 text-left xs:mt-2 xs:text-center sm:mt-3">
                  <p
                    className={cn(
                      "text-xs font-semibold transition-all duration-300 sm:text-sm",
                      {
                        "scale-110 text-primary": isActive,
                        "text-pink-froly": isComplete,
                        "text-muted-foreground": !isActive && !isComplete,
                      },
                    )}
                  >
                    {step.name}
                  </p>
                  {step.description && (
                    <p
                      className={cn(
                        "hidden text-xs transition-colors duration-300 sm:block",
                        isComplete
                          ? "text-pink-froly/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Step Content */}
      <div className="transition-all duration-300">{children}</div>
    </div>
  );
};
