"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import { usePageVisibility } from "@/hooks/use-page-visibility";
import { Snowfall } from "@namnguyenthanhwork/react-snowfall-effect";

export const Christmas: React.FC = () => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isPageVisible = usePageVisibility();

  if (prefersReducedMotion || !isPageVisible) {
    return null;
  }

  if (isMobile) {
    return (
      <Snowfall
        colors={["#a4c3fe", "#b2a4fe", "#fea4c3", "#f97b95", "#ffffff"]}
        snowflakeShape="dot"
        snowflakeCount={18}
        fps={24}
        followMouse={false}
        bounce={false}
        accumulate={false}
        fadeEdges={false}
        size={{ min: 5, max: 10 }}
        rotation={{ enabled: false, speed: { min: 0, max: 0 } }}
        zIndex={20}
      />
    );
  }

  return (
    <Snowfall
      colors={["#a4c3fe", "#b2a4fe", "#fea4c3", "#f97b95", "#ffffff"]}
      snowflakeShape="dot"
      snowflakeCount={48}
      fps={36}
      fadeEdges
      followMouse={false}
      size={{ min: 10, max: 15 }}
      wind={{ min: -0.8, max: 0.8 }}
      rotation={{ enabled: false, speed: { min: 0, max: 0 } }}
      zIndex={20}
    />
  );
};
