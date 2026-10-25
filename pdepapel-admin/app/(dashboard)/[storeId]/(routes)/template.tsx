/**
 * Entrada breve de cada pantalla del panel (0,15 s; antes 0,75 s se sentía
 * como lentitud, auditoría 2026-10-06). La plantilla se monta de nuevo en cada
 * navegación, así que la animación se repite sin JS.
 *
 * Es CSS y no framer-motion: framer pintaba `opacity: 0` desde el servidor y
 * solo la hidratación la llevaba a 1, así que una hidratación lenta dejaba la
 * pantalla en blanco (regresión 2026-10-25, F-5). Sin la animación el
 * contenido se ve igual.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="duration-150 ease-out animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
      {children}
    </div>
  );
}
