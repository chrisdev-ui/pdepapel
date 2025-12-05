import { cn } from "@/lib/utils";

type BadgeVariant = "destructive" | "primary" | "accent" | "secondary";

interface OfferBadgeProps {
  text: string;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<
  BadgeVariant,
  { gradient: string; light: string; dark: string }
> = {
  destructive: {
    gradient: "hsl(var(--destructive))",
    light: "hsl(var(--destructive) / 0.9)",
    dark: "hsl(var(--destructive) / 1.2)",
  },
  primary: {
    gradient: "hsl(var(--froly))",
    light: "hsl(var(--froly) / 0.9)",
    dark: "hsl(var(--froly) / 1.2)",
  },
  accent: {
    gradient: "hsl(var(--success))",
    light: "hsl(var(--success) / 0.9)",
    dark: "hsl(var(--success) / 1.2)",
  },
  secondary: {
    gradient: "hsl(var(--baby-blue))",
    light: "hsl(var(--baby-blue) / 0.9)",
    dark: "hsl(var(--baby-blue) / 1.2)",
  },
};

export const OfferBadge: React.FC<OfferBadgeProps> = ({
  text,
  variant = "primary",
  className,
}) => {
  const colors = variantStyles[variant];
  const gradientId = `tagGradient-${variant}`;

  // Generate starburst points
  const points = 24;
  const outerRadius = 50;
  const innerRadius = 44;

  const starburstPath =
    Array.from({ length: points * 2 }, (_, i) => {
      const angle = (i * Math.PI) / points;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = 50 + radius * Math.cos(angle - Math.PI / 2);
      const y = 50 + radius * Math.sin(angle - Math.PI / 2);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ") + " Z";

  return (
    <div
      className={cn(
        "absolute -right-2 -top-6 z-10 flex flex-col items-center",
        className,
      )}
    >
      {/* String loop */}
      <svg viewBox="0 0 30 35" className="-mb-1 h-7 w-6" fill="none">
        <path
          d="M15 35 C15 35 15 20 15 15 C15 8 8 5 8 12 C8 18 15 15 15 15 C15 15 22 18 22 12 C22 5 15 8 15 15"
          stroke="hsl(var(--foreground) / 0.6)"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>

      {/* Main circular tag */}
      <div className="group relative h-16 w-16 md:h-20 md:w-20">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full overflow-visible drop-shadow-lg"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: colors.light }} />
              <stop offset="50%" style={{ stopColor: colors.gradient }} />
              <stop offset="100%" style={{ stopColor: colors.dark }} />
            </linearGradient>

            {/* Shimmer gradient */}
            <linearGradient
              id="shimmerGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="50%" stopColor="white" stopOpacity="0.3" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>

            <clipPath id="starburstClip">
              <path d={starburstPath} />
            </clipPath>
          </defs>

          {/* Main starburst */}
          <path d={starburstPath} fill={`url(#${gradientId})`} />

          {/* Shimmer overlay */}
          <g clipPath="url(#starburstClip)">
            <rect
              x="-100"
              y="0"
              width="100"
              height="100"
              fill="url(#shimmerGradient)"
              className="animate-[shimmer-tag_2.5s_ease-in-out_infinite]"
            />
          </g>

          {/* Inner dotted circle */}
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke="hsl(var(--background))"
            strokeWidth="1"
            strokeDasharray="3 2"
            opacity="0.5"
          />

          {/* Hole for string */}
          <circle cx="50" cy="12" r="4" fill="hsl(var(--primary))" />
          <circle cx="50" cy="12" r="2" fill="hsl(var(--foreground))" />
        </svg>

        {/* Text overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="-rotate-6 text-center">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-primary-foreground drop-shadow-md">
              {text.split(" ").map((word, i) => (
                <span key={i} className="block leading-tight">
                  {word}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
