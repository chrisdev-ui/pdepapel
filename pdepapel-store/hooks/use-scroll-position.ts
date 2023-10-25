import { useEffect, useState } from "react";

export const useScrollPosition = (threshold = 1) => {
  const [scrollPosition, setScrollPosition] = useState(0);

  useEffect(() => {
    const updatePosition = () => {
      const newScrollPosition = window.scrollY;
      const distanceScrolled = Math.abs(newScrollPosition - scrollPosition);

      if (distanceScrolled >= threshold) {
        setScrollPosition(newScrollPosition);
      }
      setScrollPosition(window.scrollY);
    };

    window.addEventListener("scroll", updatePosition);

    updatePosition();

    return () => window.removeEventListener("scroll", updatePosition);
  }, [scrollPosition, threshold]);

  return scrollPosition;
};
