"use client";

import { motion } from "framer-motion";

import { CldImage } from "@/components/ui/CldImage";

interface SlideImageProps {
  src: string;
  alt: string;
  isActive: boolean;
  current: number;
  shouldAnimate: boolean;
}

export const SlideImage: React.FC<SlideImageProps> = ({
  src,
  alt,
  isActive,
  current,
  shouldAnimate,
}) => {
  return (
    <motion.div
      className="absolute inset-0"
      initial={shouldAnimate ? { scale: 1.2, opacity: 0 } : false}
      animate={{
        scale: isActive ? 1 : 1.2,
        opacity: isActive ? 1 : 0,
      }}
      exit={{ scale: 1.1, opacity: 0 }}
      transition={
        shouldAnimate
          ? {
              duration: 1.2,
              ease: [0.25, 0.46, 0.45, 0.94],
            }
          : { duration: 0 }
      }
    >
      <motion.div
        className="absolute inset-0"
        animate={
          shouldAnimate && isActive ? { scale: [1, 1.05] } : { scale: 1 }
        }
        transition={{
          duration: shouldAnimate ? 8 : 0,
          ease: "easeOut",
        }}
      >
        <CldImage
          src={src}
          alt={alt}
          fill
          priority={current === 0}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 80vw"
          format="auto"
          className="object-cover"
        />
      </motion.div>
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/50 via-transparent to-background/50" />
    </motion.div>
  );
};
