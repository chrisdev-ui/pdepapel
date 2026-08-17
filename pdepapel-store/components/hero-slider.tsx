"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { DELAY } from "@/constants";
import { cn } from "@/lib/utils";
import { Billboard, Season } from "@/types";
import {
  CandyCane,
  ChevronLeft,
  ChevronRight,
  Gift,
  Ghost,
  Moon,
  Snowflake,
  Sparkles,
  Star,
} from "lucide-react";
import { SlideContent } from "./slider-content";
import { SlideImage } from "./slider-image";
import { SlideIndicators } from "./slider-indicators";

interface HeroSliderProps {
  data: Billboard[];
  autoPlayDelay?: number;
  season?: Season;
}

const HeroSlider: React.FC<HeroSliderProps> = ({
  data,
  autoPlayDelay = DELAY,
  season = Season.Default,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasNavigated, setHasNavigated] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const goToNext = useCallback(() => {
    setHasNavigated(true);
    setCurrentIndex((prev) => (prev === data.length - 1 ? 0 : prev + 1));
  }, [data.length]);

  const goToPrevious = useCallback(() => {
    setHasNavigated(true);
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
  const isSpooky = season === Season.Spooky;
  const isChristmas = season === Season.Christmas;
  const isSeasonal = isSpooky || isChristmas;

  return (
    <section
      className="relative mx-auto w-full max-w-full overflow-hidden px-4 py-6 sm:px-6 lg:px-8"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setIsHovered(false)}
    >
      {isSpooky ? (
        <>
          <div
            className="absolute left-6 top-6 z-10 hidden text-orange-400 opacity-85 sm:left-10 sm:top-10 sm:block"
            aria-hidden="true"
          >
            <Moon className="h-4 w-4 fill-current sm:h-6 sm:w-6" />
          </div>
          <div
            className="absolute right-8 top-12 z-10 hidden text-kawaii-lavender opacity-85 sm:right-16 sm:top-20 sm:block"
            aria-hidden="true"
          >
            <Sparkles className="h-3 w-3 fill-current sm:h-4 sm:w-4" />
          </div>
          <div
            className="absolute bottom-12 left-12 z-10 hidden text-kawaii-pink opacity-80 sm:bottom-20 sm:left-20 sm:block"
            aria-hidden="true"
          >
            <Ghost className="h-4 w-4 fill-current sm:h-5 sm:w-5" />
          </div>
        </>
      ) : isChristmas ? (
        <>
          <div
            className="absolute left-6 top-6 z-10 hidden text-blue-300 opacity-90 sm:left-10 sm:top-10 sm:block"
            aria-hidden="true"
          >
            <Snowflake className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <div
            className="absolute right-8 top-12 z-10 hidden text-red-400 opacity-85 sm:right-16 sm:top-20 sm:block"
            aria-hidden="true"
          >
            <Gift className="h-3.5 w-3.5 fill-red-100 sm:h-5 sm:w-5" />
          </div>
          <div
            className="absolute bottom-12 left-12 z-10 hidden text-emerald-500 opacity-80 sm:bottom-20 sm:left-20 sm:block"
            aria-hidden="true"
          >
            <CandyCane className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </>
      ) : (
        <>
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
        </>
      )}

      {/* Main slider container */}
      <div
        className={cn(
          "kawaii-border relative aspect-[4/3] overflow-hidden rounded-2xl shadow-sm sm:aspect-[16/9] sm:rounded-3xl lg:aspect-[2.4/1]",
          isSpooky &&
            "border-orange-200/90 shadow-[0_12px_35px_rgba(249,115,22,0.16)]",
          isChristmas &&
            "border-red-200/90 shadow-[0_12px_35px_rgba(244,63,94,0.16)]",
        )}
      >
        {/* Background gradient overlay */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-0",
            isSpooky
              ? "bg-gradient-to-br from-orange-100/45 via-transparent to-kawaii-lavender/25"
              : isChristmas
                ? "bg-gradient-to-br from-red-100/40 via-transparent to-blue-100/35"
              : "bg-gradient-to-br from-kawaii-pink-light/20 via-transparent to-kawaii-blue-light/20",
          )}
        />

        {isSeasonal && (
          <div
            className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 sm:top-5"
            aria-hidden="true"
          >
            <span
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-background/90 px-3 py-1 text-[10px] font-bold text-blue-yankees shadow-sm backdrop-blur-sm sm:text-xs",
                isSpooky ? "border border-orange-200/80" : "border border-red-200/80",
              )}
            >
              {isSpooky ? (
                <Moon className="h-3 w-3 fill-orange-300 text-orange-400" />
              ) : (
                <Snowflake className="h-3 w-3 text-blue-400" />
              )}
              {isSpooky ? "Octubre mágico" : "Navidad mágica"}
              {isSpooky ? (
                <Sparkles className="h-3 w-3 text-kawaii-lavender" />
              ) : (
                <Gift className="h-3 w-3 fill-red-100 text-red-400" />
              )}
            </span>
          </div>
        )}

        {/* Slides */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            className="absolute inset-0 touch-pan-y" // touch-pan-y allows vertical scrolling while dragging horizontally
            initial={hasNavigated ? { opacity: 0, scale: 1.05 } : false}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={
              hasNavigated
                ? { duration: 0.5, ease: "easeOut" }
                : { duration: 0 }
            }
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragEnd={(e, { offset, velocity }) => {
              const swipe = Math.abs(offset.x) * velocity.x;

              if (swipe < -100 || offset.x < -100) {
                goToNext();
              } else if (swipe > 100 || offset.x > 100) {
                goToPrevious();
              }
            }}
          >
            <SlideImage
              src={currentSlide.imageUrl}
              alt={currentSlide.title ?? "Hero image"}
              isActive={true}
              current={currentIndex}
              shouldAnimate={hasNavigated}
            />
            <SlideContent
              title={currentSlide.title || ""}
              subtitle={currentSlide.label || ""}
              redirectUrl={currentSlide.redirectUrl}
              onNavigate={handleNavigate}
              shouldAnimate={hasNavigated}
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
          onSelect={(index) => {
            setHasNavigated(true);
            setCurrentIndex(index);
          }}
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
