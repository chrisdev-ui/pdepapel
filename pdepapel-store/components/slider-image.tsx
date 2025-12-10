import { motion } from "framer-motion";
import { getCldImageUrl } from "next-cloudinary";

interface SlideImageProps {
  src: string;
  alt: string;
  isActive: boolean;
  current: number;
}

export const SlideImage: React.FC<SlideImageProps> = ({
  src,
  alt,
  isActive,
  current,
}) => {
  // Generate optimized URL for the main src
  const optimizedSrc = getCldImageUrl({
    src,
    format: "auto",
    quality: "auto",
  });

  // Generate srcSet manually for responsive loading
  const widths = [640, 768, 1024, 1280, 1536];
  const srcSet = widths
    .map((width) => {
      const url = getCldImageUrl({
        src,
        width,
        format: "auto",
        quality: "auto",
      });
      return `${url} ${width}w`;
    })
    .join(", ");

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ scale: 1.2, opacity: 0 }}
      animate={{
        scale: isActive ? 1 : 1.2,
        opacity: isActive ? 1 : 0,
      }}
      exit={{ scale: 1.1, opacity: 0 }}
      transition={{
        duration: 1.2,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <motion.img
        src={optimizedSrc}
        srcSet={srcSet}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 80vw"
        alt={alt}
        className="h-full w-full object-cover"
        fetchPriority={current === 0 ? "high" : "auto"}
        animate={isActive ? { scale: [1, 1.05] } : { scale: 1 }}
        transition={{
          duration: 8,
          ease: "easeOut",
        }}
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/50 via-transparent to-background/50" />
    </motion.div>
  );
};
