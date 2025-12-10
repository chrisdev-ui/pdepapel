"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { DELAY } from "@/constants";
import { cn } from "@/lib/utils";
import { Billboard } from "@/types";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { SlideContent } from "./slider-content";
import { SlideImage } from "./slider-image";
import { SlideIndicators } from "./slider-indicators";

interface HeroSliderProps {
  data: Billboard[];
  autoPlayDelay?: number;
}

const HeroSlider: React.FC<HeroSliderProps> = ({
  data,
  autoPlayDelay = DELAY,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === data.length - 1 ? 0 : prev + 1));
  }, [data.length]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? data.length - 1 : prev - 1));
  }, [data.length]);

  useEffect(() => {
    if (isHovered || !data.length) return;

    resetTimeout();
    timeoutRef.current = setTimeout(goToNext, autoPlayDelay);

    return resetTimeout;
  }, [
    currentIndex,
    isHovered,
    autoPlayDelay,
    goToNext,
    resetTimeout,
    data.length,
  ]);

  const handleNavigate = (url: string) => {
    if (!url) return;
    router.push(url);
  };

  if (!data?.length) return null;

  const currentSlide = data[currentIndex];

  return (
    <section
      className="relative mx-auto w-full max-w-full overflow-hidden px-4 py-6 sm:px-6 lg:px-8"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Decorative floating elements - hidden on mobile */}
      <motion.div
        className="absolute left-6 top-6 z-10 hidden text-kawaii-yellow opacity-60 sm:left-10 sm:top-10 sm:block"
        animate={{ y: [-10, 10, -10], rotate: [0, 10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      >
        <Star className="h-4 w-4 fill-current sm:h-6 sm:w-6" />
      </motion.div>
      <motion.div
        className="absolute right-8 top-12 z-10 hidden text-kawaii-pink opacity-60 sm:right-16 sm:top-20 sm:block"
        animate={{ y: [10, -10, 10], rotate: [0, -10, 0] }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
        aria-hidden="true"
      >
        <Star className="h-3 w-3 fill-current sm:h-4 sm:w-4" />
      </motion.div>
      <motion.div
        className="absolute bottom-12 left-12 z-10 hidden text-kawaii-lavender opacity-60 sm:bottom-20 sm:left-20 sm:block"
        animate={{ y: [-8, 8, -8], rotate: [5, -5, 5] }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        aria-hidden="true"
      >
        <Star className="h-4 w-4 fill-current sm:h-5 sm:w-5" />
      </motion.div>

      {/* Main slider container */}
      <div className="kawaii-border relative aspect-[4/3] overflow-hidden rounded-2xl shadow-sm sm:aspect-[16/9] sm:rounded-3xl lg:aspect-[2.4/1]">
        {/* Background gradient overlay */}
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-kawaii-pink-light/20 via-transparent to-kawaii-blue-light/20" />

        {/* Slides */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <SlideImage
              src={currentSlide.imageUrl}
              alt={currentSlide.title ?? "Hero image"}
              isActive={true}
              current={currentIndex}
            />
            <SlideContent
              title={currentSlide.title || ""}
              subtitle={currentSlide.label || ""}
              redirectUrl={currentSlide.redirectUrl}
              onNavigate={handleNavigate}
            />
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows - hidden on mobile */}
        <motion.button
          className={cn(
            "absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-full p-2 sm:left-4 sm:p-3",
            "border-2 border-kawaii-pink-light bg-card/80 backdrop-blur-sm transition-all duration-300",
            "hover:border-kawaii-pink hover:bg-kawaii-pink hover:text-white",
            "hidden items-center justify-center shadow-md sm:flex",
          )}
          onClick={goToPrevious}
          whileHover={{ scale: 1.15, rotate: -5 }}
          whileTap={{ scale: 0.9 }}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -20 }}
          transition={{ duration: 0.3 }}
          aria-label="Ir a la diapositiva anterior"
        >
          <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </motion.button>

        <motion.button
          className={cn(
            "absolute right-2 top-1/2 z-30 -translate-y-1/2 rounded-full p-2 sm:right-4 sm:p-3",
            "border-2 border-kawaii-pink-light bg-card/80 backdrop-blur-sm transition-all duration-300",
            "hover:border-kawaii-pink hover:bg-kawaii-pink hover:text-white",
            "hidden items-center justify-center shadow-md sm:flex",
          )}
          onClick={goToNext}
          whileHover={{ scale: 1.15, rotate: 5 }}
          whileTap={{ scale: 0.9 }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : 20 }}
          transition={{ duration: 0.3 }}
          aria-label="Ir a la diapositiva siguiente"
        >
          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </motion.button>

        {/* Slide indicators */}
        <SlideIndicators
          total={data.length}
          current={currentIndex}
          onSelect={setCurrentIndex}
        />

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 z-30 mx-2 mb-1.5 h-1 overflow-hidden rounded-full bg-kawaii-pink-light/30 sm:mx-4 sm:mb-2 sm:h-1.5">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-kawaii-pink via-kawaii-lavender to-kawaii-blue"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{
              duration: autoPlayDelay / 1000,
              ease: "linear",
              repeat: Infinity,
            }}
            key={currentIndex}
          />
        </div>
      </div>
    </section>
  );
};

export default HeroSlider;
