/**
 * El pedido de Paula del 2026-10-22 (18:26 UTC) que el Copiloto no supo
 * responder, y los productos «capibara» del catálogo con sus nombres, SKU,
 * categorías y estado reales. Precios, costos y existencias son de prueba:
 * ninguna cifra del negocio.
 */
export const PAULA_CAPIBARA_REQUEST =
  "quiero armar un kit para sacar unos productos quietos de capibara, son: libreta argollada caibara, notas silueta capibara, cartuchera capibara, cosedora capibara, portaminas 11 minas capibara, lapicero capibara, monedero capibara tela, sticker rollo capibara, llavero capibara";

/** Las piezas como las escribió (con su «caibara»), que es lo que el modelo pasa. */
export const PAULA_CAPIBARA_PIECES = [
  "libreta argollada caibara",
  "notas silueta capibara",
  "cartuchera capibara",
  "cosedora capibara",
  "portaminas 11 minas capibara",
  "lapicero capibara",
  "monedero capibara tela",
  "sticker rollo capibara",
  "llavero capibara",
] as const;

export interface CapibaraProduct {
  name: string;
  sku: string;
  category: string;
  isArchived: boolean;
  isKit: boolean;
  price: number;
  acqPrice: number;
  stock: number;
}

const rows: [string, string, string, boolean?, boolean?][] = [
  ["Agenda Capibara", "AGE-CAP-MOR-M-L-6253", "Agendas", true],
  ["Agenda Planeadora Capibara", "PLA-CAP-CAF-S-L-3760", "Planeadores"],
  ["Borrador eléctrico Capibara", "BOR-CAP-CAF-L-P-2953", "Borradores"],
  ["Borrador retráctil Capibara", "BOR-CAP-CAF-M-L-8381", "Borradores"],
  ["Cajita de sellos Capibara", "SEL-CAP-AMA-M-L-5030", "Sellos decorativos", true],
  ["Calendario mini Capibara 2026", "CAL-CAP-AMA-S-L-1943", "Calendarios"],
  ["Cartuchera Capibara One", "CAR-CAP-BLA-M-L-4943", "Cartucheras"],
  ["Cartuchera transparente capibara", "CAR-CAP-CAF-S-L-9065", "Cartucheras", true],
  ["Grapadora Capibara", "GRA-CAP-CAF-M-L-1553", "Herramientas de oficina"],
  ["Kit Capibara x5 (con medias)", "KIT-CAP-CRE-S-P-3231", "Kits para regalar o regalarse", false, true],
  ["Kit Capibara x5 (con mini libreta)", "KIT-CAP-CAF-S-P-7073", "Kits para regalar o regalarse", false, true],
  ["Lapicero 10 minas Capibara", "LAP-CAP-CAF-S-L-8947", "Bolígrafos / Lapiceros"],
  ["Lapicero borrable Capibara", "LAP-CAP-CAF-S-L-6247", "Bolígrafos / Lapiceros"],
  ["Lapicero capibara", "LAP-ANI-CAF-S-L-6962", "Bolígrafos / Lapiceros", true],
  ["Lapicero Capibara de caritas", "LAP-CAP-CAF-S-L-1090", "Bolígrafos / Lapiceros", true],
  ["Lapicero capibara eco", "LAP-CAP-CAF-S-L-9708", "Bolígrafos / Lapiceros"],
  ["Lapicero capibara retráctil", "LAP-CAP-CAF-S-L-7435", "Bolígrafos / Lapiceros"],
  ["Libreta pequeña argollada Capibara", "LIB-CAP-AMA-XS-L-2615", "Libretas"],
  ["Libreta pequeña Capibara", "LIB-CAP-CAF-S-L-2834", "Libretas", true],
  ["Llavero Capibara", "LLA-CAP-CAF-S-L-8469", "Llaveros"],
  ["Medias Capibara", "MED-CAP-BLA-S-L-2785", "Accesorios personales"],
  ["Mini grapadora Capibara", "GRA-CAP-CAF-XS-L-4775", "Herramientas de oficina"],
  ["Mini libreta Capibara", "LIB-CAP-MUL-XS-P-5778", "Libretas"],
  ["Monedero Capibara", "MON-CAP-MUL-S-L-1587", "Monederos"],
  ["Monedero Capibara", "MON-CAP-CAF-M-L-4302", "Monederos"],
  ["Notas adhesivas Capibara siluet", "NOT-CAP-CAF-S-L-2181", "Notas adhesivas"],
  ["Pin Capibara", "PIN-CAP-CAF-S-L-2817", "Pines"],
  ["Planeador hojas Capibara", "PLA-CAP-CAF-M-P-6571", "Planeadores"],
  ["Portaminas 11 minas Capibara", "LAP-CAP-CAF-S-L-3599", "Lápices"],
  ["Regla Capibara", "REG-CAP-TRA-M-L-7845", "Reglas"],
  ["Regla Capibara eco", "REG-CAP-CAF-M-L-8807", "Reglas"],
  ["Rollo de stickers Capibara", "STI-CAP-MUL-L-P-2918", "Stickers"],
  ["Sacapuntas Capibara tanque", "TAJ-CAP-CAF-S-L-9878", "Sacapuntas", true],
  ["Sombrilla Capibara transp.", "SOM-CAP-CAF-L-P-4648", "Sombrillas"],
  ["Termo Capibara", "TER-CAP-PAS-L-P-4132", "Termos", true],
  ["Tijeras Capibara", "TIJ-CAP-CAF-S-L-7339", "Tijeras", true],
  ["Toalla Capibara", "TOA-CAP-AMA-S-L-8214", "Toallas", true],
];

export const CAPIBARA_PRODUCTS: CapibaraProduct[] = rows.map(([name, sku, category, isArchived = false, isKit = false], index) => ({
  name,
  sku,
  category,
  isArchived,
  isKit,
  price: 5000 + (index % 6) * 1000,
  acqPrice: 2000 + (index % 4) * 500,
  stock: 2 + (index % 5),
}));

/** Lo que resuelve el buscador del Copiloto con solo productos activos. */
export const CAPIBARA_EXPECTED = {
  resueltas: ["Libreta pequeña argollada Capibara", "Notas adhesivas Capibara siluet", "Cartuchera Capibara One", "Portaminas 11 minas Capibara", "Rollo de stickers Capibara", "Llavero Capibara"],
  ambiguas: {
    "lapicero capibara": ["Lapicero 10 minas Capibara", "Lapicero borrable Capibara", "Lapicero capibara eco", "Lapicero capibara retráctil"],
    "monedero capibara tela": ["Monedero Capibara", "Monedero Capibara"],
    // «Cosedora» es como se dice grapadora en Colombia.
    "cosedora capibara": ["Grapadora Capibara", "Mini grapadora Capibara"],
  },
} as const;
