import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface SlideIndicatorsProps {
  total: number;
  current: number;
  onSelect: (index: number) => void;
}

export const SlideIndicators: React.FC<SlideIndicatorsProps> = ({
  total,
  current,
  onSelect,
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-2 sm:bottom-8 sm:gap-3">
      {Array.from({ length: total }).map((_, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(idx)}
          className="group relative p-2"
          aria-label={`Ir a la diapositiva ${idx + 1}`}
        >
          <motion.div
            className={cn(
              "h-2.5 w-2.5 rounded-full border-2 transition-all duration-500 sm:h-3 sm:w-3",
              current === idx
                ? "scale-125 border-kawaii-pink bg-kawaii-pink"
                : "border-kawaii-pink-light bg-card/80 group-hover:scale-110 group-hover:border-kawaii-pink",
            )}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
          />
          {current === idx && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute inset-0 -z-10 m-auto h-5 w-5 rounded-full bg-kawaii-pink/30 blur-md sm:h-6 sm:w-6"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      ))}
    </div>
  );
};
