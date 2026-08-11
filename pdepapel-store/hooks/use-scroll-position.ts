import { useEffect, useState } from "react";

export const useScrollPosition = (threshold = 1) => {
  const [scrollPosition, setScrollPosition] = useState(0);

  useEffect(() => {
    let frameId: number | null = null;

    const updatePosition = () => {
      if (frameId !== null) return;

      frameId = window.requestAnimationFrame(() => {
        const newScrollPosition = window.scrollY;
        setScrollPosition((previousPosition) =>
          Math.abs(newScrollPosition - previousPosition) >= threshold
            ? newScrollPosition
            : previousPosition,
        );
        frameId = null;
      });
    };

    updatePosition();

    window.addEventListener("scroll", updatePosition, { passive: true });

    return () => {
      window.removeEventListener("scroll", updatePosition);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [threshold]);

  return scrollPosition;
};
