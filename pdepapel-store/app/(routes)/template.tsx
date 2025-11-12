"use client";

import { WhatsAppFloatingButton } from "@/components/whatsapp-floating-button";
import { motion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ ease: "easeInOut", duration: 0.75 }}
    >
      {children}
      <WhatsAppFloatingButton />
    </motion.div>
  );
}
