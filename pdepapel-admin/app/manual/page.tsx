import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Manual del panel | PdePapel Admin",
  description: "Guía paso a paso del panel de administración de P de Papel.",
  robots: { index: false, follow: false },
};

// La página se sirve solo con sesión: /manual no tiene extensión, así que el
// middleware de Clerk la protege como cualquier pantalla del panel. Las
// capturas se piden a /manual/img/<nombre>, también sin extensión y protegido.
const MANUAL_PATH = path.join(process.cwd(), "content", "manual", "manual.html");

function readManual(): string {
  return readFileSync(MANUAL_PATH, "utf8");
}

export default function ManualPage() {
  // Contenido estático generado por el equipo y versionado en el repositorio
  // (content/manual/manual.html); nunca proviene de usuarios ni de la base.
  return (
    <>
      <nav aria-label="Volver" className="sticky top-0 z-10 flex h-11 items-center border-b border-[var(--line)] bg-[var(--ground)] px-5 text-sm">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold text-[var(--ink)] hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al panel
        </Link>
      </nav>
      <div dangerouslySetInnerHTML={{ __html: readManual() }} />
    </>
  );
}
