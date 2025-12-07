"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import { Snowfall } from "@namnguyenthanhwork/react-snowfall-effect";

export const Christmas: React.FC = () => {
  const isMobile = useMediaQuery("(max-width: 768px)");

  if (isMobile) {
    return (
      <Snowfall
        colors={["#a4c3fe", "#b2a4fe", "#fea4c3", "#f97b95", "#ffffff"]}
        snowflakeShape="dot"
        snowflakeCount={30}
        fps={30}
        followMouse={false}
        bounce={false}
        accumulate={false}
        fadeEdges={false}
        size={{ min: 5, max: 10 }}
      />
    );
  }

  return (
    <Snowfall
      colors={["#a4c3fe", "#b2a4fe", "#fea4c3", "#f97b95", "#ffffff"]}
      snowflakeShape="dot"
      snowflakeCount={75}
      fps={60}
      fadeEdges
      followMouse
      size={{ min: 10, max: 15 }}
      wind={{ min: -0.8, max: 0.8 }}
    />
  );
};
