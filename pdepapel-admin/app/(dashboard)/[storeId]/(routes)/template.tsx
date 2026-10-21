"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Entrada breve de cada pantalla del panel. Antes eran 0,75 s y se sentía
 * como lentitud en cada navegación (auditoría 2026-10-06); 0,15 s marca el
 * cambio sin hacer esperar. Con «reducir movimiento» llega al final en 0 s.
 *
 * Siempre el mismo motion.div: el servidor no conoce la preferencia y pinta
 * el estado inicial (opacity 0). Cambiar a un <div> en el cliente dejaba ese
 * estilo puesto, porque React no corrige atributos al hidratar, y la pantalla
 * quedaba invisible.
 */
const ROUTE_TRANSITION_SECONDS = 0.15;

export default function Template({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 8, opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : { ease: "easeOut", duration: ROUTE_TRANSITION_SECONDS }}
    >
      {children}
    </motion.div>
  );
}
