import { useEffect, useState } from "react";

const getInitialVisibility = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(getInitialVisibility);

  useEffect(() => {
    const updateVisibility = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);

    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  return isVisible;
}
