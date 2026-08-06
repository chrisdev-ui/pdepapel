export interface RichTextTemplate {
  label: string;
  content: string;
}

export const PRODUCT_DESCRIPTION_TEMPLATES: RichTextTemplate[] = [
  {
    label: "✨ Lo que amarás",
    content:
      "<h2>✨ Lo que amarás</h2><ul><li>Beneficio principal del producto.</li><li>Detalle que lo hace especial.</li><li>Cómo mejora tu día a día.</li></ul>",
  },
  {
    label: "📏 Medidas y materiales",
    content:
      "<h2>📏 Medidas y materiales</h2><ul><li>Medidas: agrega ancho, alto o capacidad.</li><li>Material: especifica sus materiales principales.</li><li>Color o diseño: describe la variante.</li></ul>",
  },
  {
    label: "🎁 Ideal para regalar",
    content:
      "<h2>🎁 Ideal para regalar</h2><p>Perfecto para sorprender a quienes aman la papelería creativa.</p>",
  },
  {
    label: "📦 Incluye",
    content:
      "<h2>📦 Incluye</h2><ul><li>Agrega cada artículo incluido.</li></ul>",
  },
  {
    label: "💡 Cuidados",
    content:
      "<h2>💡 Cuidados</h2><ul><li>Indica cómo conservar el producto en buen estado.</li></ul>",
  },
];
