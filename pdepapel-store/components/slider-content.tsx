import { Button } from "@/components/ui/button";
import { motion, type Variants } from "framer-motion";
import { Heart, Sparkles } from "lucide-react";
import { Icons } from "./icons";

interface SlideContentProps {
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  redirectUrl?: string | null;
  onNavigate: (url: string) => void;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.2,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 40,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 20,
    },
  },
  exit: {
    opacity: 0,
    y: -30,
    scale: 0.95,
    transition: {
      duration: 0.3,
    },
  },
};

const floatVariants: Variants = {
  animate: {
    y: [-5, 5, -5],
    rotate: [-2, 2, -2],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

export const SlideContent: React.FC<SlideContentProps> = ({
  title,
  subtitle,
  redirectUrl,
  buttonLabel = "¡Explorar!",
  onNavigate,
}) => {
  if (!title && !subtitle) return null;

  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-center justify-center"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="glass relative mx-4 max-w-[90%] rounded-2xl px-4 py-6 text-center sm:max-w-xl sm:rounded-3xl sm:px-8 sm:py-10 md:max-w-2xl md:px-16 md:py-14 lg:max-w-3xl">
        {/* Decorative elements - hidden on smallest screens */}
        <motion.div
          className="absolute -left-2 -top-2 hidden text-kawaii-yellow sm:-left-4 sm:-top-4 sm:block"
          variants={floatVariants}
          animate="animate"
          aria-hidden="true"
        >
          <Icons.helloKitty className="h-5 w-5 sm:h-12 sm:w-12" />
        </motion.div>
        <motion.div
          className="absolute -bottom-1 -right-1 hidden text-kawaii-pink sm:-bottom-2 sm:-right-2 sm:block"
          variants={floatVariants}
          animate="animate"
          style={{ animationDelay: "0.5s" }}
          aria-hidden="true"
        >
          <Icons.myMelody className="h-4 w-4 sm:h-12 sm:w-12" />
        </motion.div>

        {title && (
          <motion.h2
            variants={itemVariants}
            className="text-gradient mb-2 pt-1.5 text-xl font-bold leading-tight sm:mb-4 sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl"
          >
            {title}
          </motion.h2>
        )}

        {subtitle && (
          <motion.p
            variants={itemVariants}
            className="mx-auto mb-4 max-w-xs text-sm font-medium leading-relaxed text-muted-foreground sm:mb-8 sm:max-w-md sm:text-base md:max-w-2xl md:text-lg lg:text-xl"
          >
            {subtitle}
          </motion.p>
        )}

        {redirectUrl && (
          <motion.div variants={itemVariants}>
            <Button
              variant="kawaii"
              size="default"
              onClick={() => onNavigate(redirectUrl)}
              className="group font-serif text-sm font-bold sm:text-base"
            >
              <Heart
                className="mr-1.5 h-3 w-3 fill-current transition-transform group-hover:scale-125 sm:mr-2 sm:h-4 sm:w-4"
                aria-hidden="true"
              />
              {buttonLabel}
              <Sparkles
                className="ml-1.5 h-3 w-3 transition-transform group-hover:rotate-12 sm:ml-2 sm:h-4 sm:w-4"
                aria-hidden="true"
              />
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
