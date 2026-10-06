"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Entrada breve de cada pantalla del panel. Antes eran 0,75 s y se sentía
 * como lentitud en cada navegación (auditoría 2026-10-06); 0,15 s marca el
 * cambio sin hacer esperar. Con «reducir movimiento» no hay animación.
 */
const ROUTE_TRANSITION_SECONDS = 0.15;

export default function Template({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div>{children}</div>;

  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 8, opacity: 0 }}
      transition={{ ease: "easeOut", duration: ROUTE_TRANSITION_SECONDS }}
    >
      {children}
    </motion.div>
  );
}
