import { cn } from "@/lib/utils";

type BadgeVariant = "destructive" | "primary" | "accent" | "secondary";

interface GroupBadgeProps {
  optionsCount: number;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<
  BadgeVariant,
  { bg: string; border: string; text: string }
> = {
  destructive: {
    bg: "bg-destructive",
    border: "border-destructive/30",
    text: "text-destructive-foreground",
  },
  primary: {
    bg: "bg-pink-froly",
    border: "border-pink-froly/30",
    text: "text-white",
  },
  accent: {
    bg: "bg-accent",
    border: "border-accent-foreground/20",
    text: "text-accent-foreground",
  },
  secondary: {
    bg: "bg-secondary",
    border: "border-secondary-foreground/20",
    text: "text-secondary-foreground",
  },
};

export const GroupBadge: React.FC<GroupBadgeProps> = ({
  optionsCount,
  variant = "primary",
  className,
}) => {
  const colors = variantStyles[variant];

  return (
    <div className={cn("absolute -right-3 -top-3 z-10", className)}>
      {/* Stacked cards container */}
      <div className="group relative h-14 w-14 cursor-pointer md:h-16 md:w-16">
        {/* Back cards (stacked effect) */}
        <div
          className={cn(
            "absolute inset-0 -translate-y-0.5 translate-x-1 rotate-[15deg] transform rounded-lg border-2 opacity-40",
            colors.bg,
            colors.border,
          )}
        />
        <div
          className={cn(
            "absolute inset-0 translate-x-0.5 rotate-[8deg] transform rounded-lg border-2 opacity-60",
            colors.bg,
            colors.border,
          )}
        />

        {/* Main front card */}
        <div
          className={cn(
            "absolute inset-0 overflow-hidden rounded-lg border-2 shadow-lg",
            "transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-105",
            colors.bg,
            colors.border,
          )}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="absolute -inset-full skew-x-12 animate-[shimmer-tag_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent 
                         via-white/25 to-transparent"
            />
          </div>

          {/* Grid pattern overlay */}
          <div className="absolute inset-0 opacity-10">
            <div
              className="h-full w-full"
              style={{
                backgroundImage: `
                  linear-gradient(to right, currentColor 1px, transparent 1px),
                  linear-gradient(to bottom, currentColor 1px, transparent 1px)
                `,
                backgroundSize: "8px 8px",
              }}
            />
          </div>

          {/* Content */}
          <div className="relative flex h-full flex-col items-center justify-center">
            <span
              className={cn(
                "font-serif text-lg font-bold leading-none drop-shadow-sm md:text-2xl",
                colors.text,
              )}
            >
              +{optionsCount}
            </span>
            <span
              className={cn(
                "mt-0.5 font-serif text-[6px] font-semibold uppercase tracking-wider opacity-90 md:text-[8px]",
                colors.text,
              )}
            >
              opciones
            </span>
          </div>
        </div>

        {/* Floating dots decoration */}
        <div className="absolute -bottom-1 -left-1 h-2 w-2 rounded-full border border-border bg-background shadow-sm" />
        <div className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full border border-border bg-background shadow-sm" />
      </div>
    </div>
  );
};
