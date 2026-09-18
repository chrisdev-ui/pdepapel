"use client";

/**
 * Salto de sección para el celular: la barra lateral con las secciones queda
 * debajo de un formulario muy largo, así que aquí arriba va un selector.
 */
export function MobileSectionNav({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm lg:hidden">
      <span className="shrink-0 font-semibold text-primary">Ir a</span>
      <select
        aria-label="Ir a una sección del formulario"
        className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
        defaultValue=""
        onChange={(event) => {
          const target = document.getElementById(event.target.value);
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
          event.target.value = "";
        }}
      >
        <option value="" disabled>
          Elige una sección…
        </option>
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.label}
          </option>
        ))}
      </select>
    </label>
  );
}
